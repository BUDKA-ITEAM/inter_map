package handlers

import (
	"encoding/json"
	"inter_map/api/internal/cache"
	"log"
	"net/http"
	"strconv"
)

type ScheduleHandler struct {
	Cache *cache.LessonCache
}

func (h *ScheduleHandler) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	// Без параметра отдаём не всю таблицу целиком, а прежнюю выборку в 500 строк.
	limit := 500
	if v := q.Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 10000 {
			limit = n
		}
	}

	if !h.Cache.Ready() {
		w.Header().Set("Retry-After", "5")
		http.Error(w, "schedule cache is warming up", http.StatusServiceUnavailable)
		return
	}

	result := h.Cache.Filter(
		q.Get("teacher_id"),
		q.Get("group"),
		q.Get("date_from"),
		q.Get("date_to"),
		limit,
	)

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "public, max-age=30")
	if err := json.NewEncoder(w).Encode(result); err != nil {
		log.Printf("encode response failed: %v", err)
	}
}
