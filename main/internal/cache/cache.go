package cache

import (
	"context"
	"inter_map/api/internal/models"
	"log"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/jackc/pgx/v5/pgxpool"
)

type LessonCache struct {
	mu      sync.RWMutex
	lessons []models.Lesson
	updated time.Time
	db      *pgxpool.Pool
}

func NewLessonCache(db *pgxpool.Pool) *LessonCache {
	return &LessonCache{db: db}
}

func (c *LessonCache) StartRefreshLoop(ctx context.Context, interval time.Duration) {
	c.refresh(ctx)

	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				c.refresh(ctx)
			}
		}
	}()
}

func (c *LessonCache) refresh(ctx context.Context) {
	queryCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	rows, err := c.db.Query(queryCtx, `
		SELECT lesson_id, teacher_id, teacher_name, date::text, weekday,
			lesson_number, time_start, time_end, subject, room_number,
			"group", week_type, cycle_week, replacement_type, bell_template
		FROM teacher_schedule
		ORDER BY date, lesson_number`)
	if err != nil {
		log.Printf("cache refresh failed: %v", err)
		return
	}
	defer rows.Close()

	var fresh []models.Lesson
	for rows.Next() {
		var l models.Lesson
		if err := rows.Scan(
			&l.LessonID, &l.TeacherID, &l.TeacherName, &l.Date, &l.Weekday,
			&l.LessonNumber, &l.TimeStart, &l.TimeEnd, &l.Subject, &l.RoomNumber,
			&l.Group, &l.WeekType, &l.CycleWeek, &l.ReplacementType, &l.BellTemplate,
		); err != nil {
			log.Printf("cache scan failed: %v", err)
			continue
		}
		fresh = append(fresh, l)
	}
	if err := rows.Err(); err != nil {
		log.Printf("cache rows error: %v", err)
		return
	}

	c.mu.Lock()
	c.lessons = fresh
	c.updated = time.Now().UTC()
	c.mu.Unlock()

	log.Printf("cache refreshed: %d lessons", len(fresh))
}

func splitGroupField(value string) []string {
	parts := strings.FieldsFunc(value, func(r rune) bool {
		return r == ',' || unicode.IsSpace(r)
	})
	result := make([]string, 0, len(parts))
	for _, p := range parts {
		trimmed := strings.Trim(p, ";.")
		if trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}

func containsGroup(field, target string) bool {
	for _, g := range splitGroupField(field) {
		if g == target {
			return true
		}
	}
	return false
}

func (c *LessonCache) Filter(teacherID, group, dateFrom, dateTo string, limit int) []models.Lesson {
	c.mu.RLock()
	defer c.mu.RUnlock()

	result := make([]models.Lesson, 0)
	for _, l := range c.lessons {
		if teacherID != "" && l.TeacherID != teacherID {
			continue
		}
		if group != "" && !containsGroup(l.Group, group) { // ← было: l.Group != group
			continue
		}
		if dateFrom != "" && (l.Date == nil || *l.Date < dateFrom) {
			continue
		}
		if dateTo != "" && (l.Date == nil || *l.Date > dateTo) {
			continue
		}
		result = append(result, l)
		if limit > 0 && len(result) >= limit {
			break
		}
	}
	return result
}

func (c *LessonCache) LastUpdated() time.Time {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.updated
}

func (c *LessonCache) Count() int {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return len(c.lessons)
}

func (c *LessonCache) IsStale(treshold time.Duration) bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if c.updated.IsZero() {
		return true
	}
	return time.Since(c.updated) > treshold
}
