package handler

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/kkc/javi-dashboard/internal/ch"
)

// errorGroup represents one aggregated exception fingerprint from mv_error_groups_state.
type errorGroup struct {
	Fingerprint      uint64 `json:"fingerprint"`
	ServiceName      string `json:"service_name"`
	ExceptionType    string `json:"exception_type"`
	ExceptionMessage string `json:"exception_message"`
	TotalCount       uint64 `json:"total_count"`
	FirstSeenMs      int64  `json:"first_seen_ms"`
	LastSeenMs       int64  `json:"last_seen_ms"`
}

type errorGroupsResponse struct {
	Groups      []errorGroup `json:"groups"`
	Window      string       `json:"window"`
	GeneratedAt time.Time    `json:"generated_at"`
}

// GetErrorGroups — GET /api/v1/errors
// Query params:
//
//	?window=1h|6h|24h|7d  (default: 24h)
//	?service=<name>       (optional)
//	?limit=<n>            (default: 100, max: 500)
func GetErrorGroups(w http.ResponseWriter, r *http.Request) {
	rawWin := r.URL.Query().Get("window")
	if rawWin == "" {
		rawWin = "24h"
	}
	winMap := map[string]time.Duration{
		"1h": time.Hour, "6h": 6 * time.Hour,
		"24h": 24 * time.Hour, "7d": 7 * 24 * time.Hour,
	}
	dur, ok := winMap[rawWin]
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid window: must be one of 1h, 6h, 24h, 7d")
		return
	}

	service := r.URL.Query().Get("service")

	limit := 100
	if s := r.URL.Query().Get("limit"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 && n <= 500 {
			limit = n
		}
	}

	since := time.Now().Add(-dur)
	// dt is a regular Date partition column; use it for pruning.
	// SimpleAggregateFunction columns (last_seen, first_seen, total_count)
	// cannot be used in WHERE — filter them with HAVING after GROUP BY.
	sinceDate := since.Format("2006-01-02")

	var whereConds []string
	var args []any

	whereConds = append(whereConds, "dt >= ?")
	args = append(args, sinceDate)

	if service != "" {
		whereConds = append(whereConds, "service_name = ?")
		args = append(args, service)
	}

	where := "WHERE " + strings.Join(whereConds, " AND ")

	query := `
SELECT
    fingerprint,
    service_name,
    exception_type,
    exception_message,
    sum(total_count)  AS total_count,
    min(first_seen)   AS first_seen,
    max(last_seen)    AS last_seen
FROM apm.mv_error_groups_state
` + where + `
GROUP BY fingerprint, service_name, exception_type, exception_message
HAVING last_seen >= ?
ORDER BY total_count DESC
LIMIT ` + strconv.Itoa(limit)

	args = append(args, since)

	ctx, cancel := context.WithTimeout(r.Context(), queryTimeout)
	defer cancel()

	rows, err := ch.DB.Query(ctx, query, args...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to query error groups")
		return
	}
	defer rows.Close()

	groups := make([]errorGroup, 0, 64)
	for rows.Next() {
		var g errorGroup
		var firstSeen, lastSeen time.Time
		if err := rows.Scan(
			&g.Fingerprint, &g.ServiceName, &g.ExceptionType, &g.ExceptionMessage,
			&g.TotalCount, &firstSeen, &lastSeen,
		); err != nil {
			writeError(w, http.StatusInternalServerError, "scan error")
			return
		}
		g.FirstSeenMs = firstSeen.UnixMilli()
		g.LastSeenMs = lastSeen.UnixMilli()
		groups = append(groups, g)
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, "row iteration error")
		return
	}

	writeJSON(w, http.StatusOK, errorGroupsResponse{
		Groups:      groups,
		Window:      rawWin,
		GeneratedAt: time.Now(),
	})
}
