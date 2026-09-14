package handlers

import (
	"context"
	"encoding/json"
	"inter_map/api/internal/cache"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type HealthHandler struct {
	DB         *pgxpool.Pool
	Cache      *cache.LessonCache
	StaleAfter time.Duration
}

func (h *HealthHandler) Check(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()

	if err := h.DB.Ping(ctx); err != nil {
		http.Error(w, "db unreachable", http.StatusServiceUnavailable)
		return
	}

	status := "ok"
	if h.Cache.IsStale(h.StaleAfter) {
		status = "degraded"
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"status":             status,
		"cache_last_updated": h.Cache.LastUpdated(),
		"lessons_count":      h.Cache.Count(),
	})
}
