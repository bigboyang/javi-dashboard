package handler

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"os"
)

// collectorBaseURL is the javi-collector HTTP address.
// Override via COLLECTOR_URL env var (default: http://localhost:4318).
var collectorBaseURL = func() string {
	if v := os.Getenv("COLLECTOR_URL"); v != "" {
		return v
	}
	return "http://localhost:4318"
}()

// RAGSearch proxies a natural-language error search to javi-collector's
// /api/collector/search endpoint.
//
//	POST /api/v1/rag/search
//	body: {"query":"...","service":"...","from_ms":0,"limit":10}
func RAGSearch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		writeError(w, http.StatusBadRequest, "read body failed")
		return
	}

	// Validate: query field must be present
	var req struct {
		Query string `json:"query"`
	}
	if err := json.Unmarshal(body, &req); err != nil || req.Query == "" {
		writeError(w, http.StatusBadRequest, "query field required")
		return
	}

	upstream, err := http.NewRequestWithContext(r.Context(), http.MethodPost,
		collectorBaseURL+"/api/collector/search", bytes.NewReader(body))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "build request failed")
		return
	}
	upstream.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(upstream)
	if err != nil {
		writeError(w, http.StatusBadGateway, "collector unreachable: "+err.Error())
		return
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		writeError(w, http.StatusBadGateway, "read response failed")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	_, _ = w.Write(respBody)
}
