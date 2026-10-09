package handlers

import (
	"encoding/json"
	"inter_map/api/internal/cache"
	"log"
	"net/http"
	"sort"
	"strconv"
	"time"
)

type ScheduleHandler struct {
	Cache *cache.LessonCache
}

type apiError struct {
	Error string `json:"error"`
}

func writeError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(apiError{Error: message})
}

const (
	apiDateLayout = "02-01-2006" // DD-MM-YYYY
	isoDateLayout = "2006-01-02" // YYYY-MM-DD
	listMaxLimit  = 10000
)

func parseDateParam(v string) (time.Time, bool) {
	for _, layout := range []string{apiDateLayout, isoDateLayout} {
		if t, err := time.Parse(layout, v); err == nil {
			return t, true
		}
	}
	return time.Time{}, false
}

func (h *ScheduleHandler) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	limit := 0
	if v := q.Get("limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n <= 0 {
			writeError(w, http.StatusBadRequest, "limit must be positive int")
			return
		}
		if n > listMaxLimit {
			writeError(w, http.StatusBadRequest, "limit can't be > 10000")
			return
		}
		limit = n
	}

	var fromT, toT time.Time
	var fromISO, toISO string

	if v := q.Get("date_from"); v != "" {
		t, ok := parseDateParam(v)
		if !ok {
			writeError(w, http.StatusBadRequest, "date_from must be in format DD-MM-YYYY or YYYY-MM-DD")
			return
		}
		fromT, fromISO = t, t.Format(isoDateLayout)
	}

	if v := q.Get("date_to"); v != "" {
		t, ok := parseDateParam(v)
		if !ok {
			writeError(w, http.StatusBadRequest, "date_to must be in format DD-MM-YYYY or YYYY-MM-DD")
			return
		}
		toT, toISO = t, t.Format(isoDateLayout)
	}

	if fromISO != "" && toISO != "" && fromT.After(toT) {
		writeError(w, http.StatusBadRequest, "date_from can't be later than date_to")
		return
	}

	result := h.Cache.Filter(
		q.Get("teacher_id"),
		q.Get("group"),
		fromISO,
		toISO,
		limit,
	)

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "public, max-age=30")
	json.NewEncoder(w).Encode(result)
}

// гетка для api/groups - список уникальных груп + сортировка
func (h *ScheduleHandler) Groups(w http.ResponseWriter, r *http.Request) {
	seen := make(map[string]struct{})
	var groups []string

	for _, l := range h.Cache.All() {
		if l.Group == "" {
			continue
		}
		if _, ok := seen[l.Group]; !ok {
			seen[l.Group] = struct{}{}
			groups = append(groups, l.Group)
		}
	}
	sort.Strings(groups)
	if groups == nil {
		groups = []string{}
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "public, max-age=300")
	if err := json.NewEncoder(w).Encode(groups); err != nil {
		log.Printf("encode groups failed: %v", err)
	}
}

// гетка для api/teachers - преподы с id и именем без дубликатов
type teacherInfo struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

func (h *ScheduleHandler) Teachers(w http.ResponseWriter, r *http.Request) {
	seen := make(map[string]struct{})
	var teachers []teacherInfo

	for _, l := range h.Cache.All() {
		if l.TeacherID == "" {
			continue
		}
		if _, ok := seen[l.TeacherID]; !ok {
			seen[l.TeacherID] = struct{}{}
			teachers = append(teachers, teacherInfo{ID: l.TeacherID, Name: l.TeacherName})
		}
	}
	sort.Slice(teachers, func(i, j int) bool { return teachers[i].Name < teachers[j].Name })
	if teachers == nil {
		teachers = []teacherInfo{}
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "public, max-age=300")
	if err := json.NewEncoder(w).Encode(teachers); err != nil {
		log.Printf("encode teachers failed: %v", err)
	}
}
