package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	appmw "inter_map/api/internal/middleware"

	"github.com/go-chi/chi"
	"github.com/jackc/pgx/v5/pgxpool"
)

type AdminHandler struct {
	DB *pgxpool.Pool
}

type roleRequestResponse struct {
	ID              int       `json:"id"`
	UserID          int       `json:"user_id"`
	Username        string    `json:"username"`
	RequestedRole   string    `json:"requested_role"`
	RequestedGroups []string  `json:"requested_groups"`
	Status          string    `json:"status"`
	CreatedAt       time.Time `json:"created_at"`
}

func (h *AdminHandler) ListRoleRequests(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")
	if status == "" {
		status = "pending"
	}

	rows, err := h.DB.Query(r.Context(), `
		SELECT rr.id, rr.user_id, u.username, rr.requested_role, rr.requested_groups, rr.status, rr.created_at
		FROM role_requests rr
		JOIN users u ON u.id = rr.user_id
		WHERE rr.status = $1
		ORDER BY rr.created_at`,
		status,
	)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	result := make([]roleRequestResponse, 0)
	for rows.Next() {
		var req roleRequestResponse
		if err := rows.Scan(&req.ID, &req.UserID, &req.Username, &req.RequestedRole,
			&req.RequestedGroups, &req.Status, &req.CreatedAt); err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		result = append(result, req)
	}
	if err := rows.Err(); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func (h *AdminHandler) ApproveRoleRequest(w http.ResponseWriter, r *http.Request) {
	h.reviewRoleRequest(w, r, "approved")
}

func (h *AdminHandler) RejectRoleRequest(w http.ResponseWriter, r *http.Request) {
	h.reviewRoleRequest(w, r, "rejected")
}

func (h *AdminHandler) reviewRoleRequest(w http.ResponseWriter, r *http.Request, outcome string) {
	claims, ok := appmw.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}

	tx, err := h.DB.Begin(r.Context())
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	var (
		userID          int
		requestedRole   string
		requestedGroups []string
		status          string
	)
	err = tx.QueryRow(r.Context(), `
		SELECT user_id, requested_role, requested_groups, status
		FROM role_requests WHERE id = $1
		FOR UPDATE`, // блокируем строку — от повторного клика "Подтвердить"
		id,
	).Scan(&userID, &requestedRole, &requestedGroups, &status)
	if err != nil {
		http.Error(w, "role request not found", http.StatusNotFound)
		return
	}
	if status != "pending" {
		http.Error(w, "role request already reviewed", http.StatusConflict)
		return
	}

	if outcome == "approved" {
		switch requestedRole {
		case "curator":
			if _, err := tx.Exec(r.Context(),
				`UPDATE users SET role = 'curator' WHERE id = $1`, userID,
			); err != nil {
				http.Error(w, "internal error", http.StatusInternalServerError)
				return
			}
			for _, group := range requestedGroups {
				if _, err := tx.Exec(r.Context(), `
					INSERT INTO curator_groups (curator_id, "group")
					VALUES ($1, $2)
					ON CONFLICT (curator_id, "group") DO NOTHING`,
					userID, group,
				); err != nil {
					http.Error(w, "internal error", http.StatusInternalServerError)
					return
				}
			}
		case "monitor":
			group := ""
			if len(requestedGroups) > 0 {
				group = requestedGroups[0]
			}
			if _, err := tx.Exec(r.Context(),
				`UPDATE users SET role = 'monitor', "group" = $2 WHERE id = $1`,
				userID, group,
			); err != nil {
				http.Error(w, "internal error", http.StatusInternalServerError)
				return
			}
		}
	}

	if _, err := tx.Exec(r.Context(), `
		UPDATE role_requests
		SET status = $1, reviewed_by = $2, reviewed_at = now()
		WHERE id = $3`,
		outcome, claims.UserID, id,
	); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
