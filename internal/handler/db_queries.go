package handler

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/kkc/javi-dashboard/internal/ch"
)

type dbQuery struct {
	ServiceName string  `json:"service_name"`
	DbSystem    string  `json:"db_system"`
	DbStatement string  `json:"db_statement"`
	TotalCount  uint64  `json:"total_count"`
	AvgMs       float64 `json:"avg_ms"`
	P95Ms       float64 `json:"p95_ms"`
	ErrorCount  uint64  `json:"error_count"`
}

type dbQueriesResponse struct {
	Queries     []dbQuery `json:"queries"`
	Window      string    `json:"window"`
	GeneratedAt time.Time `json:"generated_at"`
}

// GetDbQueries — GET /api/v1/db/queries
// Query params:
//
//	?window=1h|6h|24h|7d  (default: 24h)
//	?service=<name>        (optional)
func GetDbQueries(w http.ResponseWriter, r *http.Request) {
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
	since := time.Now().Add(-dur)
	sinceDate := since.Format("2006-01-02")

	var whereConds []string
	var args []any
	whereConds = append(whereConds, "dt >= ?")
	args = append(args, sinceDate)
	whereConds = append(whereConds, "attributes['db.system'] != ''")
	if service != "" {
		whereConds = append(whereConds, "service_name = ?")
		args = append(args, service)
	}
	where := "WHERE " + strings.Join(whereConds, " AND ")

	query := `
SELECT
    toString(service_name)                                         AS service_name,
    attributes['db.system']                                        AS db_system,
    replaceRegexpOne(
        left(coalesce(
            nullIf(attributes['db.query.text'], ''),
            nullIf(attributes['db.statement'], ''),
            name
        ), 500),
        '^prep\\d+:\\s*', ''
    )                                                              AS db_statement,
    count()                                                        AS total_count,
    toFloat64(round(avg(duration_ms), 2))                         AS avg_ms,
    toFloat64(round(quantile(0.95)(duration_ms), 2))              AS p95_ms,
    countIf(status_code = 2)                                       AS error_count
FROM apm.spans
` + where + `
GROUP BY service_name, db_system, db_statement
ORDER BY p95_ms DESC
LIMIT 100`

	ctx, cancel := context.WithTimeout(r.Context(), queryTimeout)
	defer cancel()

	rows, err := ch.DB.Query(ctx, query, args...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to query db queries")
		return
	}
	defer rows.Close()

	queries := make([]dbQuery, 0)
	for rows.Next() {
		var q dbQuery
		if err := rows.Scan(
			&q.ServiceName, &q.DbSystem, &q.DbStatement,
			&q.TotalCount, &q.AvgMs, &q.P95Ms, &q.ErrorCount,
		); err != nil {
			writeError(w, http.StatusInternalServerError, "scan error")
			return
		}
		queries = append(queries, q)
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, "row iteration error")
		return
	}

	writeJSON(w, http.StatusOK, dbQueriesResponse{
		Queries:     queries,
		Window:      rawWin,
		GeneratedAt: time.Now(),
	})
}
