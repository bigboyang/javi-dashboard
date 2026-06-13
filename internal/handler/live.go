package handler

import (
	"context"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"time"

	"github.com/kkc/javi-dashboard/internal/ch"
)

// liveEvent is a normalized view of a single telemetry signal (span, log, or
// metric) so the frontend can render one unified real-time feed.
type liveEvent struct {
	Type       string  `json:"type"` // "span" | "log" | "metric"
	TimeMs     int64   `json:"time_ms"`
	Service    string  `json:"service"`
	Title      string  `json:"title"`
	Detail     string  `json:"detail"`
	Severity   string  `json:"severity"` // "error" | "warn" | "info"
	TraceID    string  `json:"trace_id,omitempty"`
	SpanID     string  `json:"span_id,omitempty"`
	DurationMs int64   `json:"duration_ms,omitempty"`
	Value      float64 `json:"value,omitempty"`
	Kind       string  `json:"kind,omitempty"`
}

type liveStats struct {
	SpansPerMin    uint64   `json:"spans_per_min"`
	SpanErrPerMin  uint64   `json:"span_errors_per_min"`
	LogsPerMin     uint64   `json:"logs_per_min"`
	LogErrPerMin   uint64   `json:"log_errors_per_min"`
	MetricsPerMin  uint64   `json:"metrics_per_min"`
	ActiveServices []string `json:"active_services"`
}

type liveResponse struct {
	Events      []liveEvent `json:"events"`
	Stats       liveStats   `json:"stats"`
	LatestMs    int64       `json:"latest_ms"`
	ServerNowMs int64       `json:"server_now_ms"`
}

// maxLiveLookback bounds the very first poll (since=0) and clamps stale cursors
// so a long-idle browser tab cannot trigger an unbounded historical scan.
const maxLiveLookback = 5 * time.Minute

// GetLive — GET /api/v1/live
// Real-time tail of telemetry flowing through the agent → collector → ClickHouse.
// Query params:
//
//	?since=<unix_ms>   only return events newer than this (cursor; default: now-30s)
//	?service=<name>    filter to a single service (optional)
//	?limit=<n>         max events returned (default: 200, max: 500)
func GetLive(w http.ResponseWriter, r *http.Request) {
	nowMs := time.Now().UnixMilli()

	since := nowMs - 30_000 // default first window: last 30s
	if s := r.URL.Query().Get("since"); s != "" {
		if n, err := strconv.ParseInt(s, 10, 64); err == nil && n > 0 {
			since = n
		}
	}
	// Clamp stale/zero cursors so the scan is always bounded.
	if floor := nowMs - maxLiveLookback.Milliseconds(); since < floor {
		since = floor
	}

	service := r.URL.Query().Get("service")

	limit := 200
	if s := r.URL.Query().Get("limit"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 && n <= 500 {
			limit = n
		}
	}
	// Per-signal cap leaves room to merge then trim to the overall limit.
	perSignal := limit
	if perSignal < 50 {
		perSignal = 50
	}

	ctx, cancel := context.WithTimeout(r.Context(), queryTimeout)
	defer cancel()

	// service filter is appended to each WHERE clause when set; args mirror it.
	svcClause := ""
	if service != "" {
		svcClause = " AND service_name = ?"
	}

	events := make([]liveEvent, 0, perSignal*3)

	// --- Spans ---
	spanQ := fmt.Sprintf(`
SELECT service_name, name, duration_ms, status_code, is_error, received_at_ms,
       trace_id, span_id, span_kind_str, http_method, http_route, http_status_code
FROM apm.spans
WHERE received_at_ms > ?%s
ORDER BY received_at_ms DESC
LIMIT %d`, svcClause, perSignal)
	if evs, err := scanSpanEvents(ctx, spanQ, sinceArgs(since, service)...); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to query live spans")
		return
	} else {
		events = append(events, evs...)
	}

	// --- Logs ---
	logQ := fmt.Sprintf(`
SELECT service_name, body, severity_text, severity_number, received_at_ms, trace_id, logger_name
FROM apm.logs
WHERE received_at_ms > ?%s
ORDER BY received_at_ms DESC
LIMIT %d`, svcClause, perSignal)
	if evs, err := scanLogEvents(ctx, logQ, sinceArgs(since, service)...); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to query live logs")
		return
	} else {
		events = append(events, evs...)
	}

	// --- Metrics ---
	metricQ := fmt.Sprintf(`
SELECT service_name, name, type, value, received_at_ms
FROM apm.metrics
WHERE received_at_ms > ?%s
ORDER BY received_at_ms DESC
LIMIT %d`, svcClause, perSignal)
	if evs, err := scanMetricEvents(ctx, metricQ, sinceArgs(since, service)...); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to query live metrics")
		return
	} else {
		events = append(events, evs...)
	}

	// Merge newest-first across all signals, then trim to the overall limit.
	sort.Slice(events, func(i, j int) bool { return events[i].TimeMs > events[j].TimeMs })
	if len(events) > limit {
		events = events[:limit]
	}

	latest := since
	for _, e := range events {
		if e.TimeMs > latest {
			latest = e.TimeMs
		}
	}

	stats, err := queryLiveStats(ctx, service, nowMs)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to query live stats")
		return
	}

	writeJSON(w, http.StatusOK, liveResponse{
		Events:      events,
		Stats:       stats,
		LatestMs:    latest,
		ServerNowMs: nowMs,
	})
}

func scanSpanEvents(ctx context.Context, query string, args ...any) ([]liveEvent, error) {
	rows, err := ch.DB.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []liveEvent
	for rows.Next() {
		var (
			svc, name, traceID, spanID, kind, httpMethod, httpRoute string
			durationMs, receivedAt                                  int64
			statusCode                                              int32
			isError                                                 uint8
			httpStatus                                              uint16
		)
		if err := rows.Scan(&svc, &name, &durationMs, &statusCode, &isError, &receivedAt,
			&traceID, &spanID, &kind, &httpMethod, &httpRoute, &httpStatus); err != nil {
			return nil, err
		}
		sev := "info"
		if isError == 1 {
			sev = "error"
		}
		detail := kind
		if httpMethod != "" {
			detail = fmt.Sprintf("%s %s", httpMethod, httpRoute)
			if httpStatus > 0 {
				detail = fmt.Sprintf("%s → %d", detail, httpStatus)
			}
		}
		out = append(out, liveEvent{
			Type: "span", TimeMs: receivedAt, Service: svc, Title: name,
			Detail: detail, Severity: sev, TraceID: traceID, SpanID: spanID,
			DurationMs: durationMs, Kind: kind,
		})
	}
	return out, rows.Err()
}

func scanLogEvents(ctx context.Context, query string, args ...any) ([]liveEvent, error) {
	rows, err := ch.DB.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []liveEvent
	for rows.Next() {
		var (
			svc, body, sevText, traceID, logger string
			sevNum                              int32
			receivedAt                          int64
		)
		if err := rows.Scan(&svc, &body, &sevText, &sevNum, &receivedAt, &traceID, &logger); err != nil {
			return nil, err
		}
		out = append(out, liveEvent{
			Type: "log", TimeMs: receivedAt, Service: svc, Title: body,
			Detail: logger, Severity: severityClass(sevNum, sevText),
			TraceID: traceID,
		})
	}
	return out, rows.Err()
}

func scanMetricEvents(ctx context.Context, query string, args ...any) ([]liveEvent, error) {
	rows, err := ch.DB.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []liveEvent
	for rows.Next() {
		var (
			svc, name, typ string
			value          float64
			receivedAt     int64
		)
		if err := rows.Scan(&svc, &name, &typ, &value, &receivedAt); err != nil {
			return nil, err
		}
		out = append(out, liveEvent{
			Type: "metric", TimeMs: receivedAt, Service: svc, Title: name,
			Detail: typ, Severity: "info", Value: value,
		})
	}
	return out, rows.Err()
}

// queryLiveStats computes per-minute throughput (last 60s) for each signal plus
// the set of services that emitted spans in that window.
func queryLiveStats(ctx context.Context, service string, nowMs int64) (liveStats, error) {
	var stats liveStats
	cutoff := nowMs - 60_000

	svcClause := ""
	if service != "" {
		svcClause = " AND service_name = ?"
	}

	spanStatsQ := fmt.Sprintf(`
SELECT count() AS c, countIf(is_error = 1) AS e, groupUniqArray(service_name) AS svcs
FROM apm.spans
WHERE received_at_ms > ?%s`, svcClause)
	row := ch.DB.QueryRow(ctx, spanStatsQ, sinceArgs(cutoff, service)...)
	if err := row.Scan(&stats.SpansPerMin, &stats.SpanErrPerMin, &stats.ActiveServices); err != nil {
		return stats, err
	}
	if stats.ActiveServices == nil {
		stats.ActiveServices = []string{}
	}
	sort.Strings(stats.ActiveServices)

	logStatsQ := fmt.Sprintf(`
SELECT count() AS c, countIf(severity_number >= 17) AS e
FROM apm.logs
WHERE received_at_ms > ?%s`, svcClause)
	row = ch.DB.QueryRow(ctx, logStatsQ, sinceArgs(cutoff, service)...)
	if err := row.Scan(&stats.LogsPerMin, &stats.LogErrPerMin); err != nil {
		return stats, err
	}

	metricStatsQ := fmt.Sprintf(`
SELECT count() AS c
FROM apm.metrics
WHERE received_at_ms > ?%s`, svcClause)
	row = ch.DB.QueryRow(ctx, metricStatsQ, sinceArgs(cutoff, service)...)
	if err := row.Scan(&stats.MetricsPerMin); err != nil {
		return stats, err
	}

	return stats, nil
}

// sinceArgs builds the positional arg list, appending the service filter value
// only when present (matching the conditionally-built " AND service_name = ?").
func sinceArgs(ts int64, service string) []any {
	if service != "" {
		return []any{ts, service}
	}
	return []any{ts}
}

// severityClass maps an OTel severity number (and falls back to text) onto the
// three buckets the UI renders: error / warn / info.
func severityClass(num int32, text string) string {
	switch {
	case num >= 17:
		return "error"
	case num >= 13:
		return "warn"
	case num > 0:
		return "info"
	}
	switch text {
	case "ERROR", "FATAL", "CRITICAL":
		return "error"
	case "WARN", "WARNING":
		return "warn"
	default:
		return "info"
	}
}
