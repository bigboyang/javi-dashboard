package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/kkc/javi-dashboard/internal/ch"
)

type deploymentEvent struct {
	ID          string `json:"id"`
	ServiceName string `json:"service_name"`
	Version     string `json:"version"`
	Environment string `json:"environment"`
	DeployedBy  string `json:"deployed_by"`
	Description string `json:"description"`
	DeployedAt  string `json:"deployed_at"`
}

type deploymentEventsResponse struct {
	Events      []deploymentEvent `json:"events"`
	GeneratedAt time.Time         `json:"generated_at"`
}

// GetDeploymentEvents — GET /api/v1/deployments
// Query params:
//
//	?service=<name>  (optional)
//	?env=production|staging  (optional)
//	?limit=<n>       (default 50, max 200)
func GetDeploymentEvents(w http.ResponseWriter, r *http.Request) {
	service := r.URL.Query().Get("service")
	env := r.URL.Query().Get("env")

	limit := 50
	if s := r.URL.Query().Get("limit"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 && n <= 200 {
			limit = n
		}
	}

	var whereParts []string
	var args []any

	whereParts = append(whereParts, "dt >= today() - 90")
	if service != "" {
		whereParts = append(whereParts, "service_name = ?")
		args = append(args, service)
	}
	if env != "" {
		whereParts = append(whereParts, "environment = ?")
		args = append(args, env)
	}

	where := "WHERE "
	for i, p := range whereParts {
		if i > 0 {
			where += " AND "
		}
		where += p
	}

	query := `
SELECT id, service_name, version, environment, deployed_by, description,
       formatDateTime(deployed_at, '%Y-%m-%dT%H:%i:%SZ')
FROM apm.deployment_events
` + where + `
ORDER BY deployed_at DESC
LIMIT ` + strconv.Itoa(limit)

	ctx, cancel := context.WithTimeout(r.Context(), queryTimeout)
	defer cancel()

	rows, err := ch.DB.Query(ctx, query, args...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to query deployment events")
		return
	}
	defer rows.Close()

	events := make([]deploymentEvent, 0, limit)
	for rows.Next() {
		var e deploymentEvent
		if err := rows.Scan(
			&e.ID, &e.ServiceName, &e.Version, &e.Environment,
			&e.DeployedBy, &e.Description, &e.DeployedAt,
		); err != nil {
			writeError(w, http.StatusInternalServerError, "scan error")
			return
		}
		events = append(events, e)
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, "row iteration error")
		return
	}

	writeJSON(w, http.StatusOK, deploymentEventsResponse{
		Events:      events,
		GeneratedAt: time.Now(),
	})
}

// CreateDeploymentEvent — POST /api/v1/deployments
func CreateDeploymentEvent(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ServiceName string `json:"service_name"`
		Version     string `json:"version"`
		Environment string `json:"environment"`
		DeployedBy  string `json:"deployed_by"`
		Description string `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.ServiceName == "" || req.Version == "" {
		writeError(w, http.StatusBadRequest, "service_name and version are required")
		return
	}
	if req.Environment == "" {
		req.Environment = "production"
	}
	validEnvs := map[string]bool{"production": true, "staging": true, "development": true}
	if !validEnvs[req.Environment] {
		writeError(w, http.StatusBadRequest, "environment must be production, staging, or development")
		return
	}

	id := uuid.New().String()

	ctx, cancel := context.WithTimeout(r.Context(), queryTimeout)
	defer cancel()

	err := ch.DB.Exec(ctx, `
INSERT INTO apm.deployment_events
    (id, service_name, version, environment, deployed_by, description, deployed_at)
VALUES (?, ?, ?, ?, ?, ?, now())`,
		id, req.ServiceName, req.Version, req.Environment,
		req.DeployedBy, req.Description)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create deployment event")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]string{"status": "created", "id": id})
}
