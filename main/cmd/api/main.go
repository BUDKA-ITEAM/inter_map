package main

import (
	"context"
	"inter_map/api/internal/cache"
	"inter_map/api/internal/config"
	"inter_map/api/internal/db"
	"inter_map/api/internal/handlers"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi"
	"github.com/go-chi/chi/middleware"
	"github.com/go-chi/cors"
	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()

	cfg := config.Load()

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	pool, err := db.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("db error: %v", err)
	}
	defer pool.Close()

	lessonCache := cache.NewLessonCache(pool)
	lessonCache.StartRefreshLoop(ctx, cfg.CacheRefreshInterval)

	sceduleH := &handlers.ScheduleHandler{Cache: lessonCache}
	healthH := &handlers.HealthHandler{
		DB:         pool,
		Cache:      lessonCache,
		StaleAfter: cfg.CacheRefreshInterval * 3,
	}

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(10 * time.Second))
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins: cfg.AllowedOrigins,
		AllowedMethods: []string{"GET", "OPTIONS"},
	}))

	r.Get("/healthz", healthH.Check)
	r.Get("/api/lessons", sceduleH.List)

	srv := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: r,
	}

	go func() {
		log.Printf("listening on : %s", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	<-ctx.Done()
	log.Printf("shutting down...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("shutdown error: %v", err)
	}
}
