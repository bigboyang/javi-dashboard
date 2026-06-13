package handler

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/kkc/javi-dashboard/internal/ch"
)

type logVolumeBucket struct {
	Ts       int64  `json:"ts"`
	Severity string `json:"severity"`
	Count    uint64 `json:"count"`
}

type logVolumeResponse struct {
	Buckets     []logVolumeBucket `json:"buckets"`
	Window      string            `json:"window"`
	GeneratedAt time.Time         `json:"generated_at"`
}

// GetLogVolume — GET /api/v1/logs/volume
// Query params:
//
//	?window=1h|6h|24h|7d  (default: 6h)
//	?service=<name>        (optional)
func GetLogVolume(w http.ResponseWriter, r *http.Request) {
	rawWin := r.URL.Query().Get("window")
	if rawWin == "" {
		rawWin = "6h"
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

	// Use hourly bucket for long windows, 5-minute for short windows
	var bucketExpr string
	if dur <= time.Hour {
		bucketExpr = "toStartOfFiveMinutes(minute)"
	} else if dur <= 6*time.Hour {
		bucketExpr = "toStartOfFifteenMinutes(minute)"
	} else {
		bucketExpr = "toStartOfHour(minute)"
	}

	var whereConds []string
	var args []any
	whereConds = append(whereConds, "dt >= ?")
	args = append(args, sinceDate)
	whereConds = append(whereConds, "minute >= ?")
	args = append(args, since)
	if service != "" {
		whereConds = append(whereConds, "service_name = ?")
		args = append(args, service)
	}
	where := "WHERE " + strings.Join(whereConds, " AND ")

	// Cast to Int64 to avoid UInt64 scan issues with the Go driver.
	query := `
SELECT
    CAST(toUnixTimestamp(` + bucketExpr + `) AS Int64) * 1000 AS ts,
    severity_text,
    sum(log_count) AS cnt
FROM apm.mv_log_volume_1m_state
` + where + `
GROUP BY ts, severity_text
ORDER BY ts ASC, severity_text ASC`

	ctx, cancel := context.WithTimeout(r.Context(), queryTimeout)
	defer cancel()

	rows, err := ch.DB.Query(ctx, query, args...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to query log volume")
		return
	}
	defer rows.Close()

	buckets := make([]logVolumeBucket, 0, 128)
	for rows.Next() {
		var b logVolumeBucket
		if err := rows.Scan(&b.Ts, &b.Severity, &b.Count); err != nil {
			writeError(w, http.StatusInternalServerError, "scan error")
			return
		}
		buckets = append(buckets, b)
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, "row iteration error")
		return
	}

	writeJSON(w, http.StatusOK, logVolumeResponse{
		Buckets:     buckets,
		Window:      rawWin,
		GeneratedAt: time.Now(),
	})
}
