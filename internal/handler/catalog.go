package handler

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/kkc/javi-dashboard/internal/ch"
)

type serviceCatalogEntry struct {
	ServiceName      string `json:"service_name"`
	Team             string `json:"team"`
	SlackChannel     string `json:"slack_channel"`
	RunbookURL       string `json:"runbook_url"`
	Tier             string `json:"tier"`
	OnCallRotation   string `json:"on_call_rotation"`
	Description      string `json:"description"`
	UpdatedAt        string `json:"updated_at"`
}

// GetServiceCatalog — GET /api/v1/catalog
func GetServiceCatalog(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), queryTimeout)
	defer cancel()

	rows, err := ch.DB.Query(ctx, `
SELECT service_name, team, slack_channel, runbook_url, tier, on_call_rotation, description,
       formatDateTime(updated_at, '%Y-%m-%dT%H:%i:%SZ')
FROM apm.service_catalog FINAL
ORDER BY service_name`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to query service catalog")
		return
	}
	defer rows.Close()

	entries := make([]serviceCatalogEntry, 0)
	for rows.Next() {
		var e serviceCatalogEntry
		if err := rows.Scan(
			&e.ServiceName, &e.Team, &e.SlackChannel, &e.RunbookURL,
			&e.Tier, &e.OnCallRotation, &e.Description, &e.UpdatedAt,
		); err != nil {
			writeError(w, http.StatusInternalServerError, "scan error")
			return
		}
		entries = append(entries, e)
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, "row iteration error")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"entries": entries})
}

// UpsertServiceCatalog — POST /api/v1/catalog
func UpsertServiceCatalog(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ServiceName    string `json:"service_name"`
		Team           string `json:"team"`
		SlackChannel   string `json:"slack_channel"`
		RunbookURL     string `json:"runbook_url"`
		Tier           string `json:"tier"`
		OnCallRotation string `json:"on_call_rotation"`
		Description    string `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.ServiceName == "" {
		writeError(w, http.StatusBadRequest, "service_name is required")
		return
	}
	validTiers := map[string]bool{"critical": true, "high": true, "standard": true, "low": true}
	if req.Tier == "" {
		req.Tier = "standard"
	}
	if !validTiers[req.Tier] {
		writeError(w, http.StatusBadRequest, "tier must be critical, high, standard, or low")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), queryTimeout)
	defer cancel()

	err := ch.DB.Exec(ctx, `
INSERT INTO apm.service_catalog
    (service_name, team, slack_channel, runbook_url, tier, on_call_rotation, description, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, now())`,
		req.ServiceName, req.Team, req.SlackChannel, req.RunbookURL,
		req.Tier, req.OnCallRotation, req.Description)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to upsert service catalog entry")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]string{"status": "created"})
}

// DeleteServiceCatalog — DELETE /api/v1/catalog/{service}
func DeleteServiceCatalog(w http.ResponseWriter, r *http.Request) {
	service := r.URL.Query().Get("service")
	if service == "" {
		writeError(w, http.StatusBadRequest, "service query parameter is required")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), queryTimeout)
	defer cancel()

	err := ch.DB.Exec(ctx,
		`ALTER TABLE apm.service_catalog DELETE WHERE service_name = ?`, service)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete catalog entry")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}
