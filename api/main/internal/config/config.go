package config

import (
	"log"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	DatabaseURL          string
	Port                 string
	AllowedOrigins       []string
	CacheRefreshInterval time.Duration
}

func Load() *Config {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://postgres:postgres@localhost:5432/college_schedule?sslmode=disable"
		log.Println("warning: DATABASE_URL not set, using local default")
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	var origins []string
	if raw := os.Getenv("ALLOWED_ORIGINS"); raw != "" {
		for _, o := range strings.Split(raw, ",") {
			if trimmed := strings.TrimSpace(o); trimmed != "" {
				origins = append(origins, trimmed)
			}
		}
		// Локальную разработку добавляем всегда: иначе страница, открытая
		// через Live Server, не проходит cors, когда список задан боевым доменом.
		origins = append(origins, "http://localhost:*", "http://127.0.0.1:*")
	} else {
		origins = []string{"*"}
		log.Println("warning: ALLOWED_ORIGINS not set, allowing all origins")
	}

	refreshMinutes := 15
	if raw := os.Getenv("CACHE_REFRESH_MINUTES"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n > 0 {
			refreshMinutes = n
		}
	}

	return &Config{
		DatabaseURL:          dbURL,
		Port:                 port,
		AllowedOrigins:       origins,
		CacheRefreshInterval: time.Duration(refreshMinutes) * time.Minute,
	}
}
