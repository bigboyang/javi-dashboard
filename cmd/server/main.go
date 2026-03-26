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
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
