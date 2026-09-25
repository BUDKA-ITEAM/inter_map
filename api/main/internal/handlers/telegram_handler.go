package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"

	appmw "inter_map/api/internal/middleware"

	"github.com/jackc/pgx/v5/pgxpool"
)

type TelegramHandler struct {
	DB          *pgxpool.Pool
	BotUsername string
}

func (h *TelegramHandler) GenerateLinkCode(w http.ResponseWriter, r *http.Request) {
	claims, ok := appmw.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	code, err := randomCode(4)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	if _, err = h.DB.Exec(r.Context(), `
		INSERT INTO telegram_link_codes (code, user_id, expires_at)
		VALUES ($1, $2, now() + interval '15 minutes')`,
		code, claims.UserID,
	); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	link := ""
	if h.BotUsername != "" {
		link = fmt.Sprintf("https://t.me/%s?start=%s", h.BotUsername, code)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"code":         code,
		"link":         link,
		"instructions": "Откройте ссылку в Telegram — код применится автоматически.",
	})
}

func randomCode(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
