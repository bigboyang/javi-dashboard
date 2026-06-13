package handler

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/kkc/javi-dashboard/internal/ch"
)

type profilingSession struct {
	ID          string `json:"id"`
	ServiceName string `json:"service_name"`
	ProfileType string `json:"profile_type"`
	Host        string `json:"host"`
	DurationMs  int64  `json:"duration_ms"`
	SampledAt   string `json:"sampled_at"`
}

type profilingSessionsResponse struct {
	Sessions    []profilingSession `json:"sessions"`
	GeneratedAt time.Time          `json:"generated_at"`
}

type profilingPayloadResponse struct {
	ID          string `json:"id"`
	ServiceName string `json:"service_name"`
	ProfileType string `json:"profile_type"`
	Format      string `json:"format"`
	Payload     string `json:"payload"`
	Host        string `json:"host"`
	DurationMs  int64  `json:"duration_ms"`
	SampledAt   string `json:"sampled_at"`
}

// GetProfilingSessions — GET /api/v1/profiling/sessions
// Query params:
//
//	?service=<name>         (optional)
//	?type=cpu|alloc         (optional, default all)
//	?limit=<n>              (default 20, max 100)
func GetProfilingSessions(w http.ResponseWriter, r *http.Request) {
	service := r.URL.Query().Get("service")
	profileType := r.URL.Query().Get("type")

	limit := 20
	if s := r.URL.Query().Get("limit"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 && n <= 100 {
			limit = n
		}
	}

	var whereParts []string
	var args []any

	// Default to last 30 days
	whereParts = append(whereParts, "dt >= today() - 30")

	if service != "" {
		whereParts = append(whereParts, "service_name = ?")
		args = append(args, service)
	}
	if profileType != "" {
		whereParts = append(whereParts, "profile_type = ?")
		args = append(args, profileType)
	}

	where := "WHERE "
	for i, p := range whereParts {
		if i > 0 {
			where += " AND "
		}
		where += p
	}

	query := `
SELECT id, service_name, profile_type, host, duration_ms,
       formatDateTime(sampled_at, '%Y-%m-%dT%H:%i:%SZ')
FROM apm.profiling_snapshots
` + where + `
ORDER BY sampled_at DESC
LIMIT ` + strconv.Itoa(limit)

	ctx, cancel := context.WithTimeout(r.Context(), queryTimeout)
	defer cancel()

	rows, err := ch.DB.Query(ctx, query, args...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to query profiling sessions")
		return
	}
	defer rows.Close()

	sessions := make([]profilingSession, 0, limit)
	for rows.Next() {
		var s profilingSession
		if err := rows.Scan(
			&s.ID, &s.ServiceName, &s.ProfileType, &s.Host,
			&s.DurationMs, &s.SampledAt,
		); err != nil {
			writeError(w, http.StatusInternalServerError, "scan error")
			return
		}
		sessions = append(sessions, s)
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, "row iteration error")
		return
	}

	writeJSON(w, http.StatusOK, profilingSessionsResponse{
		Sessions:    sessions,
		GeneratedAt: time.Now(),
	})
}

// GetProfilingPayload — GET /api/v1/profiling/sessions/{id}
// Returns the full collapsed-format payload for flame graph rendering.
func GetProfilingPayload(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "id is required")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), queryTimeout)
	defer cancel()

	row := ch.DB.QueryRow(ctx, `
SELECT id, service_name, profile_type, format, payload, host, duration_ms,
       formatDateTime(sampled_at, '%Y-%m-%dT%H:%i:%SZ')
FROM apm.profiling_snapshots
WHERE id = ?
LIMIT 1`, id)

	var p profilingPayloadResponse
	if err := row.Scan(
		&p.ID, &p.ServiceName, &p.ProfileType, &p.Format, &p.Payload,
		&p.Host, &p.DurationMs, &p.SampledAt,
	); err != nil {
		writeError(w, http.StatusNotFound, "profiling session not found")
		return
	}

	writeJSON(w, http.StatusOK, p)
}
