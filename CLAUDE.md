# javi-dashboard

ClickHouse 데이터를 보여주는 대시보드. **Go API 서버 + Vite/TypeScript 프론트엔드** 모노레포 구조.

## 아키텍처

- `cmd/server` — Go API 서버 진입점
- `internal/` — 서버 내부 패키지(도메인 로직, 핸들러 등)
- `web/` — Vite + TypeScript 프론트엔드 (테스트: vitest)
- `schema/` — 데이터 스키마 정의
- `scripts/` — 보조 스크립트
- 데이터 저장소: **ClickHouse** (마이그레이션은 `migrations/*.sql`, `clickhouse-client`로 실행)

## 개발 명령 (Makefile)

- `make dev` — API + 프론트 동시 실행
- `make dev-api` — Go API 서버만 (`go run ./cmd/server`)
- `make dev-web` — Vite dev 서버만 (`web/`)
- `make build` — Go 바이너리 빌드 → `bin/javi-dashboard`
- `make test` — Go 테스트 (`go test ./...`)
- `make typecheck` — 프론트 타입 검사 (`web/`, `tsc --noEmit`)
- `make install` — 프론트 의존성 설치 (`web/ && npm install`)
- `make migrate` — ClickHouse 마이그레이션 실행

### 프론트엔드 (`web/`)

- `npm run dev` / `build` / `preview` / `typecheck`
- 테스트: `npm run test` (vitest), `npm run test:coverage`

## 규칙·관례

> 코딩 컨벤션, 설계 의도, 주의사항을 여기에 적어두세요.
> PR로 코드가 바뀌면 이 서술형 영역은 GitHub Actions(Claude)가 자동으로 보강합니다.

<!-- AUTO-GENERATED:start (스크립트가 관리. 직접 수정 금지) -->

_아래 구간은 스크립트가 자동 생성합니다. 직접 수정하지 마세요._

### 기술 스택
- Go (`go.mod`)
- Docker (`Dockerfile`)

### 명령어
**Make 타깃**:
```
build
dev
dev-api
dev-web
help
install
migrate
test
typecheck
```

### 최상위 디렉터리 구조
```
.github
cmd
internal
schema
scripts
web
```

<!-- AUTO-GENERATED:end -->
