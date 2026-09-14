package handlers

import (
	"encoding/json"
	"inter_map/api/internal/cache"
	"log"
	"net/http"
	"strconv"

	"github.com/jackc/pgx/v5/pgxpool"
)

type ScheduleHandler struct {
	Cache *cache.LessonCache
	DB    *pgxpool.Pool
}

func (h *ScheduleHandler) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	limit := 0
	if v := q.Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 10000 {
			limit = n
		}
	}

	result := h.Cache.Filter(
		q.Get("teacher_id"),
		q.Get("group"),
		q.Get("date_from"),
		q.Get("date_to"),
		limit,
	)

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "public, max-age=60")
	if err := json.NewEncoder(w).Encode(result); err != nil {
		log.Printf("encode response failed: %v", err)
	}
}
