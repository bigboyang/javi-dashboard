package handler

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
)

// RAGSearch proxies a natural-language log search to javi-forecast's
// /api/rag/logs/search endpoint.
//
//	POST /api/v1/rag/search
//	body: {"query":"...","service":"...","limit":10}
//
// Maps dashboard fields to forecast fields:
//
//	query   → question
//	service → service_name
//	limit   → top_k
func RAGSearch(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		writeError(w, http.StatusBadRequest, "read body failed")
		return
	}

	var in struct {
		Query   string `json:"query"`
		Service string `json:"service"`
		Limit   int    `json:"limit"`
	}
	if err := json.Unmarshal(body, &in); err != nil || in.Query == "" {
		writeError(w, http.StatusBadRequest, "query field required")
		return
	}
	topK := in.Limit
	if topK <= 0 {
		topK = 10
	}

	forecBody, err := json.Marshal(map[string]any{
		"question":     in.Query,
		"service_name": in.Service,
		"top_k":        topK,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "build request failed")
		return
	}

	upstream, err := http.NewRequestWithContext(r.Context(), http.MethodPost,
		forecastBaseURL+"/api/rag/logs/search", bytes.NewReader(forecBody))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "build request failed")
		return
	}
	upstream.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(upstream)
	if err != nil {
		writeError(w, http.StatusBadGateway, "forecast unreachable: "+err.Error())
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
