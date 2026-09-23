package handlers

import (
	"encoding/json"
	"errors"
	"net/http"

	"inter_map/api/internal/auth"
	appmw "inter_map/api/internal/middleware"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type AuthHandler struct {
	DB     *pgxpool.Pool
	Secret []byte
}

type registerRequest struct {
	Username        string   `json:"username"`
	Password        string   `json:"password"`
	FullName        string   `json:"full_name"`
	Group           string   `json:"group"`
	RequestedRole   string   `json:"requested_role"`   // "" | "monitor" | "curator"
	RequestedGroups []string `json:"requested_groups"` // для curator
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req registerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	if req.Username == "" || req.Password == "" || req.Group == "" {
		http.Error(w, "username, password and group are required", http.StatusBadRequest)
		return
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	tx, err := h.DB.Begin(r.Context())
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	var userID int
	err = tx.QueryRow(r.Context(), `
		INSERT INTO users (username, password_hash, full_name, role, "group")
		VALUES ($1, $2, $3, 'student', $4)
		RETURNING id`,
		req.Username, hash, req.FullName, req.Group,
	).Scan(&userID)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			http.Error(w, "username already taken", http.StatusConflict)
			return
		}
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	if req.RequestedRole == "monitor" || req.RequestedRole == "curator" {
		groups := req.RequestedGroups
		if req.RequestedRole == "monitor" {
			groups = []string{req.Group} // староста ведёт свою же группу
		}
		if len(groups) == 0 {
			http.Error(w, "requested_groups is required", http.StatusBadRequest)
			return
		}
		if _, err = tx.Exec(r.Context(), `
			INSERT INTO role_requests (user_id, requested_role, requested_groups)
			VALUES ($1, $2, $3)`,
			userID, req.RequestedRole, groups,
		); err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	token, err := auth.GenerateToken(h.Secret, userID, "student", req.Group)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"token": token})
}

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}

	var (
		userID       int
		passwordHash string
		role         string
		group        string
	)
	err := h.DB.QueryRow(r.Context(), `
		SELECT id, password_hash, role, "group" FROM users WHERE username = $1`,
		req.Username,
	).Scan(&userID, &passwordHash, &role, &group)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "invalid credentials", http.StatusUnauthorized)
			return
		}
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	if !auth.CheckPassword(passwordHash, req.Password) {
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	}

	token, err := auth.GenerateToken(h.Secret, userID, role, group)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"token": token})
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	claims, ok := appmw.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var username, fullName string
	if err := h.DB.QueryRow(r.Context(),
		`SELECT username, full_name FROM users WHERE id = $1`, claims.UserID,
	).Scan(&username, &fullName); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	resp := map[string]any{
		"user_id": claims.UserID, "username": username,
		"full_name": fullName, "role": claims.Role, "group": claims.Group,
	}

	if claims.Role == "curator" {
		rows, err := h.DB.Query(r.Context(),
			`SELECT "group" FROM curator_groups WHERE curator_id = $1`, claims.UserID)
		if err == nil {
			defer rows.Close()
			var groups []string
			for rows.Next() {
				var g string
				if rows.Scan(&g) == nil {
					groups = append(groups, g)
				}
			}
			resp["groups"] = groups
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}
