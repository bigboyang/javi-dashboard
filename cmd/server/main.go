package main

import (
	"context"
	"embed"
	"io/fs"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/joho/godotenv"

	"github.com/kkc/javi-dashboard/internal/ch"
	"github.com/kkc/javi-dashboard/internal/handler"
	"github.com/kkc/javi-dashboard/internal/repository"
)

//go:embed web/dist
var webDist embed.FS

func main() {
	// .env 파일 로드 (없어도 무시)
	_ = godotenv.Load()

	// ClickHouse 연결
	if err := ch.Connect(); err != nil {
		log.Fatalf("failed to connect clickhouse: %v", err)
	}
	log.Println("clickhouse connected")

	// Alert rules — ensure table and preload from ClickHouse
	if err := repository.InitAlertRules(context.Background()); err != nil {
		log.Printf("alert_rules init warning (non-fatal): %v", err)
	}

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
		r.Get("/services", handler.GetServices)
		r.Route("/services/{service}", func(r chi.Router) {
			r.Get("/red", handler.GetREDSeries)
			r.Get("/operations", handler.GetOperations)
		})

		// Phase 2: Trace Explorer
		r.Get("/traces", handler.GetTraces)
		r.Get("/traces/{traceId}", handler.GetTraceDetail)

		// Live Stream — real-time unified telemetry tail (spans/logs/metrics)
		r.Get("/live", handler.GetLive)

		// Phase 3: Log Explorer
		r.Get("/logs", handler.GetLogs)

		// Phase 4: Service Topology
		r.Get("/topology", handler.GetTopology)

		// Phase 5: Custom Metrics
		r.Get("/metrics/names", handler.GetMetricNames)
		r.Get("/metrics/series", handler.GetMetricSeries)

		// Phase 6: Alerting
		r.Get("/alerts/rules", handler.GetAlertRules)
		r.Post("/alerts/rules", handler.CreateAlertRule)
		r.Patch("/alerts/rules/{id}", handler.PatchAlertRule)
		r.Delete("/alerts/rules/{id}", handler.DeleteAlertRule)
		r.Get("/alerts/status", handler.GetAlertStatus)

		// Phase 7: Forecast Dashboard
		r.Get("/forecast/red", handler.GetForecastRED)
		r.Get("/forecast/service/{name}", handler.GetForecastService)
		r.Get("/forecast/capacity", handler.GetForecastCapacity)
		r.Get("/forecast/anomalies", handler.GetForecastAnomalies)

		// Phase 8: AIOps Dashboard
		r.Get("/aiops/anomalies", handler.GetAIOpsAnomalies)
		r.Get("/aiops/rca", handler.GetAIOpsRCA)

		// Phase 8: JVM Analytics (proxy → javi-forecast)
		r.Get("/jvm/services", handler.GetJVMServices)
		r.Get("/jvm/health/{service}", handler.GetJVMHealth)
		r.Get("/jvm/history/{service}", handler.GetJVMHistory)

		// Phase 8: Granger Causality (proxy → javi-forecast)
		r.Get("/dependency/graph", handler.GetDependencyGraph)
		r.Get("/dependency/{service}/causes", handler.GetDependencyCauses)

		// RAG search (proxies to javi-collector)
		r.Post("/rag/search", handler.RAGSearch)

		// Error Groups — GAP-3
		r.Get("/errors", handler.GetErrorGroups)

		// Infrastructure / K8s Pod Metrics — GAP-2
		r.Route("/infra/pods/{service}", func(r chi.Router) {
			r.Get("/", handler.GetInfraPods)
			r.Get("/timeseries", handler.GetInfraTimeseries)
		})

		// Log Volume Chart — GAP-4
		r.Get("/logs/volume", handler.GetLogVolume)

		// Slow Spans Explorer — GAP-5
		r.Get("/spans/slow", handler.GetSlowSpans)

		// Database Query Analysis — GAP-4
		r.Get("/db/queries", handler.GetDbQueries)

		// SLO Dashboard — GAP-6
		r.Route("/slo", func(r chi.Router) {
			r.Get("/definitions", handler.GetSLODefinitions)
			r.Post("/definitions", handler.CreateSLODefinition)
			r.Delete("/definitions/{service}/{name}", handler.DeleteSLODefinition)
			r.Get("/status", handler.GetSLOStatus)
		})

		// Profiling Flame Graph — Nice-to-have
		r.Get("/profiling/sessions", handler.GetProfilingSessions)
		r.Get("/profiling/sessions/{id}", handler.GetProfilingPayload)

		// Histogram Percentile — Nice-to-have
		r.Get("/metrics/histogram", handler.GetHistogram)

		// Service Catalog — Nice-to-have
		r.Get("/catalog", handler.GetServiceCatalog)
		r.Post("/catalog", handler.UpsertServiceCatalog)
		r.Delete("/catalog", handler.DeleteServiceCatalog)

		// Deployment Events — Nice-to-have
		r.Get("/deployments", handler.GetDeploymentEvents)
		r.Post("/deployments", handler.CreateDeploymentEvent)
	})

	// Serve React SPA — unknown paths fall back to index.html for client-side routing
	webFS, err := fs.Sub(webDist, "web/dist")
	if err != nil {
		log.Fatalf("failed to create web FS: %v", err)
	}
	r.Handle("/*", spaHandler(webFS))

	port := os.Getenv("SERVER_PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("javi-dashboard listening on :%s", port)
	if err := http.ListenAndServe(":"+port, r); err != nil {
		log.Fatal(err)
	}
}

// spaHandler serves static files from webFS; unknown paths return index.html
// so the React router can handle client-side navigation.
func spaHandler(webFS fs.FS) http.HandlerFunc {
	fileServer := http.FileServer(http.FS(webFS))
	return func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if _, err := fs.Stat(webFS, path[1:]); err != nil {
			r2 := *r
			r2.URL = *&r.URL
			r2.URL.Path = "/"
			fileServer.ServeHTTP(w, &r2)
			return
		}
		fileServer.ServeHTTP(w, r)
	}
}

// corsMiddleware sets CORS headers. Origins are controlled by CORS_ALLOWED_ORIGINS
// (comma-separated). Defaults to "*" for local development.
func corsMiddleware(next http.Handler) http.Handler {
	rawOrigins := os.Getenv("CORS_ALLOWED_ORIGINS")
	if rawOrigins == "" {
		rawOrigins = "*"
	}
	origins := strings.Split(rawOrigins, ",")
	for i, o := range origins {
		origins[i] = strings.TrimSpace(o)
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		allowed := rawOrigins == "*"
		if !allowed {
			for _, o := range origins {
				if o == origin {
					allowed = true
					break
				}
			}
		}

		if allowed {
			if rawOrigins == "*" {
				w.Header().Set("Access-Control-Allow-Origin", "*")
			} else {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Add("Vary", "Origin")
			}
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
