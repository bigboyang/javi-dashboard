package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/kkc/javi-dashboard/internal/ch"
)

type healthResponse struct {
	Status      string `json:"status"`
	ClickHouse  string `json:"clickhouse"`
	Timestamp   string `json:"timestamp"`
}

func Health(w http.ResponseWriter, r *http.Request) {
	resp := healthResponse{
		Status:    "ok",
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}

	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()

	if err := ch.DB.Ping(ctx); err != nil {
		resp.Status = "degraded"
		resp.ClickHouse = "unreachable: " + err.Error()
	} else {
		resp.ClickHouse = "ok"
	}

	w.Header().Set("Content-Type", "application/json")
	if resp.Status != "ok" {
		w.WriteHeader(http.StatusServiceUnavailable)
	}
	json.NewEncoder(w).Encode(resp)
}
