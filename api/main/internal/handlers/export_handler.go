package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"inter_map/api/internal/cache"
	"inter_map/api/internal/mailer"
	appmw "inter_map/api/internal/middleware"
	"inter_map/api/internal/models"
	"inter_map/api/internal/telegram"
	"inter_map/api/internal/vk"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/xuri/excelize/v2"
)

type ExportHandler struct {
	DB     *pgxpool.Pool
	Cache  *cache.LessonCache
	Bot    *telegram.Bot // опционален, оставлен на будущее
	VKBot  *vk.Bot
	Mailer *mailer.Mailer
}

func (h *ExportHandler) ExportToCurator(w http.ResponseWriter, r *http.Request) {
	claims, ok := appmw.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	lessonID, err := strconv.Atoi(r.URL.Query().Get("lesson_id"))
	if err != nil {
		http.Error(w, "invalid lesson_id", http.StatusBadRequest)
		return
	}

	lesson, found := h.Cache.FindByID(lessonID)
	if !found {
		http.Error(w, "lesson not found", http.StatusNotFound)
		return
	}
	if lesson.Date == nil {
		http.Error(w, "lesson has no date", http.StatusInternalServerError)
		return
	}
	lessonGroups := cache.SplitGroupField(lesson.Group)

	myGroups, err := authorizedGroupsSubset(r.Context(), claims, h.DB, lessonGroups)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	if len(myGroups) == 0 {
		http.Error(w, "not allowed to export this lesson", http.StatusForbidden)
		return
	}

	sent, skipped := 0, 0
	for _, group := range myGroups {
		data, err := h.buildWorkbookForGroupDay(r.Context(), group, *lesson.Date)
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		curatorIDs, err := curatorsForGroups(r.Context(), h.DB, []string{group})
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		filename := fmt.Sprintf("attendance_%s_%s.xlsx", sanitizeFilename(group), *lesson.Date)
		caption := fmt.Sprintf("Посещаемость %s за %s (обновлено)", group, *lesson.Date)

		for _, curatorID := range curatorIDs {
			var vkID *int64
			var email *string
			if err := h.DB.QueryRow(r.Context(),
				`SELECT vk_id, email FROM users WHERE id = $1`, curatorID,
			).Scan(&vkID, &email); err != nil {
				skipped++
				continue
			}

			delivered := false
			if h.VKBot != nil && vkID != nil {
				if err := h.VKBot.SendDocument(*vkID, filename, data, caption); err == nil {
					delivered = true
				}
			}
			if h.Mailer != nil && email != nil && *email != "" {
				if err := h.Mailer.SendDocument(*email, caption, "Файл во вложении.", filename, data); err == nil {
					delivered = true
				}
			}

			if delivered {
				sent++
			} else {
				skipped++
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]int{"sent": sent, "skipped": skipped})
}

// buildWorkbookForGroupDay собирает ПОЛНЫЙ файл заново — по одному листу
// на каждую пару этой группы за эту дату, у которой уже есть отметки.
func (h *ExportHandler) buildWorkbookForGroupDay(ctx context.Context, group, date string) ([]byte, error) {
	lessons := h.Cache.Filter("", group, date, date, 0)

	f := excelize.NewFile()
	f.DeleteSheet("Sheet1")
	hasSheet := false

	for _, lesson := range lessons {
		type record struct {
			fullName, username, status string
			markedAt                   time.Time
		}

		rows, err := h.DB.Query(ctx, `
			SELECT u.full_name, u.username, a.status, a.marked_at
			FROM attendance a
			JOIN users u ON u.id = a.student_id
			WHERE a.lesson_id = $1 AND u."group" = $2
			ORDER BY u.full_name`,
			lesson.LessonID, group,
		)
		if err != nil {
			return nil, err
		}

		var records []record
		for rows.Next() {
			var rec record
			if err := rows.Scan(&rec.fullName, &rec.username, &rec.status, &rec.markedAt); err != nil {
				rows.Close()
				return nil, err
			}
			records = append(records, rec)
		}
		scanErr := rows.Err()
		rows.Close()
		if scanErr != nil {
			return nil, scanErr
		}
		if len(records) == 0 {
			continue // эту пару ещё не отмечали — пропускаем, лист не создаём
		}

		sheetName := sheetNameForLesson(lesson)
		f.NewSheet(sheetName)
		hasSheet = true

		for i, hd := range []string{"ФИО", "Логин", "Статус", "Отмечено"} {
			cell, _ := excelize.CoordinatesToCellName(i+1, 1)
			f.SetCellValue(sheetName, cell, hd)
		}
		for rIdx, rec := range records {
			values := []any{rec.fullName, rec.username, rec.status, rec.markedAt.Format("2006-01-02 15:04")}
			for i, v := range values {
				cell, _ := excelize.CoordinatesToCellName(i+1, rIdx+2)
				f.SetCellValue(sheetName, cell, v)
			}
		}
	}

	if !hasSheet {
		f.NewSheet("Sheet1") // excelize не сохранит файл вообще без листов
	}

	buf, err := f.WriteToBuffer()
	if err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func sheetNameForLesson(l models.Lesson) string {
	num := 0
	if l.LessonNumber != nil {
		num = *l.LessonNumber
	}
	name := fmt.Sprintf("Пара %d %s", num, l.TimeStart)
	name = strings.NewReplacer(":", "-", "/", "-", "\\", "-", "?", "", "*", "", "[", "", "]", "").Replace(name)
	if len(name) > 31 { // ограничение Excel на длину имени листа
		name = name[:31]
	}
	return name
}

func sanitizeFilename(s string) string {
	return strings.NewReplacer("/", "-", "\\", "-", ":", "-").Replace(s)
}

func curatorsForGroups(ctx context.Context, db *pgxpool.Pool, groups []string) ([]int, error) {
	rows, err := db.Query(ctx,
		`SELECT DISTINCT curator_id FROM curator_groups WHERE "group" = ANY($1)`, groups)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []int
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}
