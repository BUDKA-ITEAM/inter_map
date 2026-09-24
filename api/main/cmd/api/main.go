package main

import (
	"context"
	"inter_map/api/internal/auth"
	"inter_map/api/internal/cache"
	"inter_map/api/internal/config"
	"inter_map/api/internal/db"
	"inter_map/api/internal/handlers"
	appmw "inter_map/api/internal/middleware"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi"
	"github.com/go-chi/chi/middleware"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5/pgxpool"
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

	jwtSecret := []byte(cfg.JWTSecret)
	if len(jwtSecret) == 0 {
		log.Println("warning: JWT_SECRET not set — using insecure default, DO NOT use in production")
		jwtSecret = []byte("dev-insecure-secret-change-me")
	}

	if err := ensureAdminAccount(ctx, pool, cfg.AdminUsername, cfg.AdminPassword); err != nil {
		log.Printf("admin bootstrap failed: %v", err)
	}

	lessonCache := cache.NewLessonCache(pool)
	lessonCache.StartRefreshLoop(ctx, cfg.CacheRefreshInterval)

	scheduleH := &handlers.ScheduleHandler{Cache: lessonCache}
	healthH := &handlers.HealthHandler{
		DB:         pool,
		Cache:      lessonCache,
		StaleAfter: cfg.CacheRefreshInterval * 3,
	}
	authH := &handlers.AuthHandler{DB: pool, Secret: jwtSecret}
	attendanceH := &handlers.AttendanceHandler{DB: pool, Cache: lessonCache}

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(10 * time.Second))
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins: cfg.AllowedOrigins,
		AllowedMethods: []string{"GET", "POST", "OPTIONS"},        // POST добавлен — иначе auth/attendance не пройдут CORS
		AllowedHeaders: []string{"Content-Type", "Authorization"}, // нужно для JSON-тела и Bearer-токена
	}))

	r.Get("/healthz", healthH.Check)
	r.Get("/api/lessons", scheduleH.List)

	r.Post("/api/auth/register", authH.Register)
	r.Post("/api/auth/login", authH.Login)

	r.Group(func(r chi.Router) {
		r.Use(appmw.RequireAuth(jwtSecret))
		r.Get("/api/auth/me", authH.Me)
		r.Get("/api/attendance", attendanceH.List)

		r.Group(func(r chi.Router) {
			r.Use(appmw.RequireRole("monitor", "curator"))
			r.Post("/api/attendance", attendanceH.Mark)
		})
	})

	adminH := &handlers.AdminHandler{DB: pool}

	r.Group(func(r chi.Router) {
		r.Use(appmw.RequireAuth(jwtSecret))
		r.Use(appmw.RequireRole("admin"))
		r.Get("/api/admin/role-requests", adminH.ListRoleRequests)
		r.Post("/api/admin/role-requests/{id}/approve", adminH.ApproveRoleRequest)
		r.Post("/api/admin/role-requests/{id}/reject", adminH.RejectRoleRequest)
	})

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

// ensureAdminAccount создаёт учётку admin из переменных окружения при
// первом старте, если её ещё нет. Без ADMIN_USERNAME/ADMIN_PASSWORD
// админ не создаётся — самостоятельная регистрация роли admin через
// /api/auth/register запрещена намеренно.
func ensureAdminAccount(ctx context.Context, db *pgxpool.Pool, username, password string) error {
	if username == "" || password == "" {
		return nil
	}

	var exists bool
	if err := db.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM users WHERE username = $1)`, username,
	).Scan(&exists); err != nil {
		return err
	}
	if exists {
		return nil
	}

	hash, err := auth.HashPassword(password)
	if err != nil {
		return err
	}

	_, err = db.Exec(ctx, `
		INSERT INTO users (username, password_hash, full_name, role, "group")
		VALUES ($1, $2, 'Administrator', 'admin', '')`,
		username, hash,
	)
	return err
}
