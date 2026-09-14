package config

import (
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
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	var origins []string
	if raw := os.Getenv("ALLOWED_ORIGINS"); raw != "" {
		for _, o := range strings.Split(raw, ",") {
			origins = append(origins, strings.TrimSpace(o))
		}
	} else {
		origins = []string{"*"}
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
