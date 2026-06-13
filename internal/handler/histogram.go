package handler

import (
	"context"
	"net/http"
	"time"

	"github.com/kkc/javi-dashboard/internal/ch"
)

type histogramPoint struct {
	Hour         string    `json:"hour"`
	TotalCount   uint64    `json:"total_count"`
	Sum          float64   `json:"total_sum"`
	Avg          float64   `json:"avg"`
	BucketCounts []uint64  `json:"bucket_counts"`
	Bounds       []float64 `json:"bounds"`
}

type histogramMetric struct {
	MetricName  string           `json:"metric_name"`
	ServiceName string           `json:"service_name"`
	Points      []histogramPoint `json:"points"`
}

type histogramResponse struct {
	Metrics     []histogramMetric `json:"metrics"`
	Window      string            `json:"window"`
	GeneratedAt time.Time         `json:"generated_at"`
}

// GetHistogram — GET /api/v1/metrics/histogram
// Query params:
//
//	?service=<name>  (optional)
//	?metric=<name>   (optional, filter by metric name)
//	?window=1d|7d|30d (default: 7d)
func GetHistogram(w http.ResponseWriter, r *http.Request) {
	service := r.URL.Query().Get("service")
	metricFilter := r.URL.Query().Get("metric")

	rawWin := r.URL.Query().Get("window")
	if rawWin == "" {
		rawWin = "7d"
	}
	winDays := map[string]int{"1d": 1, "7d": 7, "30d": 30}
	days, ok := winDays[rawWin]
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid window: must be 1d, 7d, or 30d")
		return
	}

	var whereParts []string
	var args []any

	whereParts = append(whereParts, "dt >= today() - ?")
	args = append(args, days)
	if service != "" {
		whereParts = append(whereParts, "service_name = ?")
		args = append(args, service)
	}
	if metricFilter != "" {
		whereParts = append(whereParts, "metric_name = ?")
		args = append(args, metricFilter)
	}

	where := "WHERE "
	for i, p := range whereParts {
		if i > 0 {
			where += " AND "
		}
		where += p
	}

	query := `
SELECT
    service_name,
    metric_name,
    formatDateTime(hour, '%Y-%m-%dT%H:%i:%SZ') AS hour_str,
    sumMerge(count_state) AS total_count,
    sumMerge(sum_state) AS total_sum,
    sumForEachMerge(bucket_counts_state) AS bucket_counts,
    anyMerge(bounds_state) AS bounds
FROM apm.mv_histogram_1h_state
` + where + `
GROUP BY service_name, metric_name, hour
ORDER BY service_name, metric_name, hour ASC`

	ctx, cancel := context.WithTimeout(r.Context(), queryTimeout)
	defer cancel()

	rows, err := ch.DB.Query(ctx, query, args...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to query histogram data")
		return
	}
	defer rows.Close()

	// Group points by (service_name, metric_name)
	type metricKey struct{ service, metric string }
	metricMap := make(map[metricKey]*histogramMetric)
	var metricOrder []metricKey

	for rows.Next() {
		var svc, metricName, hourStr string
		var totalCount uint64
		var totalSum float64
		var bucketCounts []uint64
		var bounds []float64

		if err := rows.Scan(
			&svc, &metricName, &hourStr,
			&totalCount, &totalSum,
			&bucketCounts, &bounds,
		); err != nil {
			writeError(w, http.StatusInternalServerError, "scan error")
			return
		}

		avg := 0.0
		if totalCount > 0 {
			avg = totalSum / float64(totalCount)
		}

		key := metricKey{svc, metricName}
		if _, exists := metricMap[key]; !exists {
			metricMap[key] = &histogramMetric{
				MetricName:  metricName,
				ServiceName: svc,
				Points:      make([]histogramPoint, 0),
			}
			metricOrder = append(metricOrder, key)
		}
		metricMap[key].Points = append(metricMap[key].Points, histogramPoint{
			Hour:         hourStr,
			TotalCount:   totalCount,
			Sum:          totalSum,
			Avg:          avg,
			BucketCounts: bucketCounts,
			Bounds:       bounds,
		})
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, "row iteration error")
		return
	}

	metrics := make([]histogramMetric, 0, len(metricOrder))
	for _, key := range metricOrder {
		metrics = append(metrics, *metricMap[key])
	}

	writeJSON(w, http.StatusOK, histogramResponse{
		Metrics:     metrics,
		Window:      rawWin,
		GeneratedAt: time.Now(),
	})
}
