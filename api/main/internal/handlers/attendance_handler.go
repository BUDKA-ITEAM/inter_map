package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"inter_map/api/internal/auth"
	"inter_map/api/internal/cache"
	appmw "inter_map/api/internal/middleware"

	"github.com/jackc/pgx/v5/pgxpool"
)

type AttendanceHandler struct {
	DB    *pgxpool.Pool
	Cache *cache.LessonCache
}

type markAttendanceRequest struct {
	LessonID  int    `json:"lesson_id"`
	StudentID int    `json:"student_id"`
	Status    string `json:"status"` // "present" | "absent" | "excused"
}

func (h *AttendanceHandler) Mark(w http.ResponseWriter, r *http.Request) {
	claims, ok := appmw.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req markAttendanceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	if req.Status != "present" && req.Status != "absent" && req.Status != "excused" {
		http.Error(w, "invalid status", http.StatusBadRequest)
		return
	}

	lesson, found := h.Cache.FindByID(req.LessonID)
	if !found {
		http.Error(w, "lesson not found", http.StatusNotFound)
		return
	}
	lessonGroups := cache.SplitGroupField(lesson.Group)

	if !authorizedForGroups(r.Context(), claims, h.DB, lessonGroups) {
		http.Error(w, "not allowed to mark attendance for this group", http.StatusForbidden)
		return
	}

	// студент точно должен быть из группы этого занятия — иначе можно
	// было бы отметить присутствие кому угодно, из другой группы
	var studentGroup string
	if err := h.DB.QueryRow(r.Context(),
		`SELECT "group" FROM users WHERE id = $1 AND role = 'student'`, req.StudentID,
	).Scan(&studentGroup); err != nil {
		http.Error(w, "student not found", http.StatusNotFound)
		return
	}
	if !containsString(lessonGroups, studentGroup) {
		http.Error(w, "student is not in this lesson's group", http.StatusBadRequest)
		return
	}

	_, err := h.DB.Exec(r.Context(), `
		INSERT INTO attendance (lesson_id, student_id, status, marked_by)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (lesson_id, student_id)
		DO UPDATE SET status = EXCLUDED.status, marked_by = EXCLUDED.marked_by, marked_at = now()`,
		req.LessonID, req.StudentID, req.Status, claims.UserID,
	)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// monitor — только своя группа; curator — любая из групп в curator_groups
func authorizedForGroups(ctx context.Context, claims *auth.Claims, db *pgxpool.Pool, lessonGroups []string) bool {
	switch claims.Role {
	case "monitor":
		return containsString(lessonGroups, claims.Group)
	case "curator":
		rows, err := db.Query(ctx, `SELECT "group" FROM curator_groups WHERE curator_id = $1`, claims.UserID)
		if err != nil {
			return false
		}
		defer rows.Close()
		for rows.Next() {
			var g string
			if rows.Scan(&g) == nil && containsString(lessonGroups, g) {
				return true
			}
		}
		return false
	default:
		return false
	}
}

func containsString(list []string, target string) bool {
	for _, v := range list {
		if v == target {
			return true
		}
	}
	return false
}

type attendanceRecord struct {
	ID        int       `json:"id"`
	LessonID  int       `json:"lesson_id"`
	StudentID int       `json:"student_id"`
	Username  string    `json:"username"`
	FullName  string    `json:"full_name"`
	Status    string    `json:"status"`
	MarkedBy  int       `json:"marked_by"`
	MarkedAt  time.Time `json:"marked_at"`
}

func (h *AttendanceHandler) List(w http.ResponseWriter, r *http.Request) {
	claims, ok := appmw.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	query := `
		SELECT a.id, a.lesson_id, a.student_id, u.username, u.full_name, a.status, a.marked_by, a.marked_at
		FROM attendance a
		JOIN users u ON u.id = a.student_id
		WHERE 1=1`
	var args []any
	argN := 1

	switch claims.Role {
	case "student":
		query += fmt.Sprintf(` AND a.student_id = $%d`, argN)
		args = append(args, claims.UserID)
		argN++
	case "monitor":
		query += fmt.Sprintf(` AND u."group" = $%d`, argN)
		args = append(args, claims.Group)
		argN++
	case "curator":
		groups, err := h.curatorGroups(r.Context(), claims.UserID)
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		if len(groups) == 0 {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode([]attendanceRecord{})
			return
		}
		query += fmt.Sprintf(` AND u."group" = ANY($%d)`, argN)
		args = append(args, groups)
		argN++
	case "admin":
		// без ограничения по группе
	default:
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	if lessonIDStr := r.URL.Query().Get("lesson_id"); lessonIDStr != "" {
		lessonID, err := strconv.Atoi(lessonIDStr)
		if err != nil {
			http.Error(w, "invalid lesson_id", http.StatusBadRequest)
			return
		}
		query += fmt.Sprintf(` AND a.lesson_id = $%d`, argN)
		args = append(args, lessonID)
		argN++
	}

	query += ` ORDER BY a.marked_at DESC`

	rows, err := h.DB.Query(r.Context(), query, args...)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	result := make([]attendanceRecord, 0)
	for rows.Next() {
		var rec attendanceRecord
		if err := rows.Scan(&rec.ID, &rec.LessonID, &rec.StudentID, &rec.Username,
			&rec.FullName, &rec.Status, &rec.MarkedBy, &rec.MarkedAt); err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		result = append(result, rec)
	}
	if err := rows.Err(); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func (h *AttendanceHandler) curatorGroups(ctx context.Context, curatorID int) ([]string, error) {
	rows, err := h.DB.Query(ctx, `SELECT "group" FROM curator_groups WHERE curator_id = $1`, curatorID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var groups []string
	for rows.Next() {
		var g string
		if err := rows.Scan(&g); err != nil {
			return nil, err
		}
		groups = append(groups, g)
	}
	return groups, rows.Err()
}
