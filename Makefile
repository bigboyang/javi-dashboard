.PHONY: dev dev-api dev-web build test typecheck

# 전체 개발 서버 (API + Frontend 동시 실행)
dev:
	@make -j2 dev-api dev-web

# Go API 서버만 실행
dev-api:
	@go run ./cmd/server

# Vite dev 서버만 실행
dev-web:
	@cd web && npm run dev

# Go 빌드
build:
	@go build -o bin/javi-dashboard ./cmd/server

# Go 테스트
test:
	@go test ./...

# TypeScript 타입 검사
typecheck:
	@cd web && npm run typecheck

# 의존성 설치
install:
	@cd web && npm install

# ClickHouse migration 실행
migrate:
	@for f in migrations/*.sql; do \
		echo "Running $$f..."; \
		clickhouse-client --query "$$(cat $$f)"; \
	done
