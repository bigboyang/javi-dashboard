package main

import (
	"log"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/joho/godotenv"

	"github.com/kkc/javi-dashboard/internal/ch"
	"github.com/kkc/javi-dashboard/internal/handler"
)

func main() {
	// .env 파일 로드 (없어도 무시)
	_ = godotenv.Load()

	// ClickHouse 연결
	if err := ch.Connect(); err != nil {
		log.Fatalf("failed to connect clickhouse: %v", err)
	}
	log.Println("clickhouse connected")

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(corsMiddleware)

	// Health check
	r.Get("/health", handler.Health)

	// API v1
	r.Route("/api/v1", func(r chi.Router) {
		r.Get("/ping", func(w http.ResponseWriter, _ *http.Request) {
			w.Write([]byte(`{"message":"pong"}`))
		})

		// Phase 1: Service Overview RED Dashboard
		// GET /api/v1/services                          — all services, aggregate RED
		// GET /api/v1/services/{service}/red            — time-series RED for one service
		// GET /api/v1/services/{service}/operations     — top operations for one service
		r.Get("/services", handler.GetServices)
		r.Route("/services/{service}", func(r chi.Router) {
			r.Get("/red", handler.GetREDSeries)
			r.Get("/operations", handler.GetOperations)
		})

		// Phase 2: Trace Explorer
		// GET /api/v1/traces                  — recent trace list with optional service filter
		// GET /api/v1/traces/{traceId}         — all spans for a trace (waterfall)
		r.Get("/traces", handler.GetTraces)
		r.Get("/traces/{traceId}", handler.GetTraceDetail)

		// Phase 3: Log Explorer
		// GET /api/v1/logs  — recent log entries with optional service/level/search filters
		r.Get("/logs", handler.GetLogs)

		// Phase 4: Service Topology
		// GET /api/v1/topology  — service dependency graph derived from trace spans
		r.Get("/topology", handler.GetTopology)

		// Phase 5: Custom Metrics
		// GET /api/v1/metrics/names   — list metric instruments with optional service filter
		// GET /api/v1/metrics/series  — time-series for a specific metric
		r.Get("/metrics/names", handler.GetMetricNames)
		r.Get("/metrics/series", handler.GetMetricSeries)

		// Phase 6: Alerting
		// GET    /api/v1/alerts/rules       — list all alert rules
		// POST   /api/v1/alerts/rules       — create a new alert rule
		// DELETE /api/v1/alerts/rules/{id}  — delete an alert rule
		// GET    /api/v1/alerts/status      — evaluate rules against current metrics
		r.Get("/alerts/rules", handler.GetAlertRules)
		r.Post("/alerts/rules", handler.CreateAlertRule)
		r.Delete("/alerts/rules/{id}", handler.DeleteAlertRule)
		r.Get("/alerts/status", handler.GetAlertStatus)

		// Phase 7: Forecast Dashboard
		// GET /api/v1/forecast/red                — RED forecast for all services (60s cache)
		// GET /api/v1/forecast/service/{name}     — per-service forecast (?metric=all)
		// GET /api/v1/forecast/capacity           — capacity headroom predictions
		// GET /api/v1/forecast/anomalies          — SLO burn rate / forecast anomalies (?severity=warn|critical)
		r.Get("/forecast/red", handler.GetForecastRED)
		r.Get("/forecast/service/{name}", handler.GetForecastService)
		r.Get("/forecast/capacity", handler.GetForecastCapacity)
		r.Get("/forecast/anomalies", handler.GetForecastAnomalies)

		// Phase 8: AIOps Dashboard
		// GET /api/v1/aiops/anomalies             — detected anomalies from apm.anomalies (?window&service&severity)
		// GET /api/v1/aiops/rca                   — RCA reports from apm.rca_reports (?window&service)
		r.Get("/aiops/anomalies", handler.GetAIOpsAnomalies)
		r.Get("/aiops/rca", handler.GetAIOpsRCA)

		// Phase 8: JVM Analytics (proxy → javi-forecast /api/jvm/*)
		// GET /api/v1/jvm/services                — list services with JVM data
		// GET /api/v1/jvm/health/{service}        — latest JVM snapshot
		// GET /api/v1/jvm/history/{service}       — JVM history (?window_minutes=60)
		r.Get("/jvm/services", handler.GetJVMServices)
		r.Get("/jvm/health/{service}", handler.GetJVMHealth)
		r.Get("/jvm/history/{service}", handler.GetJVMHistory)

		// Phase 8: Granger Causality (proxy → javi-forecast /dependency/*)
		// GET /api/v1/dependency/graph            — all causal edges
		// GET /api/v1/dependency/{service}/causes — root causes for a service
		r.Get("/dependency/graph", handler.GetDependencyGraph)
		r.Get("/dependency/{service}/causes", handler.GetDependencyCauses)
	})

	port := os.Getenv("SERVER_PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("javi-dashboard listening on :%s", port)
	if err := http.ListenAndServe(":"+port, r); err != nil {
		log.Fatal(err)
	}
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
