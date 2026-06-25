# javi-dashboard 아키텍처 가이드

> 이 문서는 PR 마다 자동 생성/갱신됩니다.

이 문서는 새로 합류한 사람 개발자가 코드를 처음 펼쳤을 때 "이게 뭘 하는 프로젝트고, 어디부터 봐야 하는지"를 빠르게 잡을 수 있도록 쓴 안내서입니다. AI 에이전트용 간결 문서인 `CLAUDE.md`와 달리, 풀어서 설명하는 산문체로 작성합니다.

## 1. 이 프로젝트는 무엇인가

javi-dashboard는 **ClickHouse에 적재된 텔레메트리 데이터를 보여주는 APM(Application Performance Monitoring) 대시보드**입니다. OpenTelemetry(OTLP) 호환 스팬(트레이스), 메트릭, 로그가 ClickHouse에 쌓여 있고, 이 레포는 그 데이터를 조회해 사람이 보기 좋은 형태로 보여주는 **Go API 서버 + React/TypeScript 프론트엔드**를 제공합니다.

`cmd/server/main.go`의 라우트 주석을 보면 기능이 "Phase 1 ~ Phase 8"로 단계적으로 늘어난 흔적이 보입니다 (서비스 개요/RED 지표 → 트레이스 → 로그 → 토폴로지 → 메트릭 → 알림 → 예측(forecast) → AIOps/JVM/프로파일링 순). 즉 처음엔 단순한 "서비스 상태 보드"였다가, 점점 트레이스 탐색기, 로그 검색, 이상탐지, 용량 예측까지 영역을 넓혀온 프로젝트로 보입니다.

## 2. 전체 아키텍처

```
   OpenTelemetry Collector 등
   (스팬 / 메트릭 / 로그 적재 — 이 레포 밖에서 일어남)
              │
              ▼
   ┌─────────────────────────┐
   │      ClickHouse          │   apm.spans / apm.metrics / apm.logs
   │  (database: apm)         │   apm.alert_rules
   └─────────────────────────┘
              ▲
              │  clickhouse-go/v2 (네이티브 프로토콜, :9000)
              │
   ┌─────────────────────────────────────────────┐
   │   Go API 서버 (cmd/server, internal/*)        │
   │                                               │
   │   internal/ch          → ClickHouse 커넥션,    │
   │                           alert_rules DDL/DML  │
   │   internal/repository  → SQL 조회 로직         │
   │   internal/model       → 요청/응답 타입,        │
   │                           window 파라미터 검증  │
   │   internal/handler     → HTTP 핸들러            │
   │                           (chi 라우터에 연결)    │
   │                                               │
   │   chi 라우터: /health, /api/v1/*               │
   │   + //go:embed 된 web/dist (React SPA) 서빙    │
   └─────────────────────────────────────────────┘
              ▲
              │  HTTP (JSON, /api/v1/...)
              │
   ┌─────────────────────────────────────────────┐
   │   React + TypeScript SPA (web/)               │
   │   TanStack Router(파일 기반 라우팅)             │
   │   TanStack Query(서버 상태) + Zustand(클라 상태) │
   │   uplot(시계열 차트) + Tailwind CSS             │
   └─────────────────────────────────────────────┘
              ▲
              │
           브라우저 / 사용자
```

운영 환경에서는 **하나의 Go 바이너리**만 떠 있습니다. React 빌드 결과물(`web/dist`)을 Go가 `//go:embed`로 통째로 끌어안고 있어서, 정적 파일 서버를 따로 둘 필요가 없습니다. 로컬 개발할 때만 Vite dev 서버와 Go 서버가 분리되어 떠 있고, Vite가 `/api`, `/health` 요청을 Go 서버로 프록시합니다.

## 3. 데이터/요청 흐름

1. **수집(이 레포 범위 밖)**: 어딘가의 애플리케이션/컬렉터가 OTLP 형태의 스팬·메트릭·로그를 만들어 ClickHouse의 `apm.spans`, `apm.metrics`, `apm.logs` 테이블에 적재합니다. 이 레포는 적재 파이프라인을 포함하지 않고, **읽기 전용 조회/시각화**만 담당합니다.
2. **요청 진입**: 브라우저가 `/api/v1/...` 경로로 요청을 보내면, chi 라우터(`cmd/server/main.go`)가 해당 `internal/handler` 함수로 디스패치합니다.
3. **검증**: 핸들러는 쿼리 파라미터를 검증합니다. 예를 들어 시간 범위는 `internal/model/service.go`의 `ParseWindow()`가 `5m|15m|1h|6h|24h` 화이트리스트로만 허용합니다(임의 문자열을 SQL에 흘려보내지 않기 위한 안전장치).
4. **조회**: 핸들러가 `internal/repository`의 함수를 호출하면, 그 함수가 `internal/ch.DB`(패키지 전역 ClickHouse 커넥션 핸들)에 파라미터 바인딩(`?` placeholder) 방식으로 SQL을 날립니다. 모든 조회에는 10초 타임아웃(`queryTimeout`)이 걸려 있어, 느린 쿼리가 HTTP 워커를 무한정 붙잡지 않습니다.
5. **응답**: 조회 결과를 Go 구조체(`internal/model`)로 매핑한 뒤 `writeJSON`으로 JSON 직렬화해 응답합니다.
6. **렌더링**: 프론트엔드는 TanStack Query로 이 JSON을 가져와 캐싱(15초 stale time, 15초 주기 자동 재조회)하고, uplot 차트나 테이블 컴포넌트로 그립니다.
7. **알림 규칙은 예외적으로 캐시된다**: `apm.alert_rules` 테이블의 알림 규칙은 서버 기동 시(`repository.InitAlertRules`) ClickHouse에서 한 번 읽어 메모리에 올려두고, 이후 CRUD는 이 캐시 + ClickHouse를 함께 갱신하는 식으로 동작합니다(매 요청마다 ClickHouse를 조회하지 않음).
8. **SPA 라우팅**: `/api`, `/health`가 아닌 나머지 모든 경로는 React SPA로 폴백됩니다. 즉 `/services/foo` 같은 브라우저 주소창 직접 접근도 `index.html`을 돌려주고, 그 뒤 클라이언트 사이드 라우터(TanStack Router)가 화면을 그립니다.

## 4. 디렉터리·모듈별 역할

### `cmd/server/`
Go 프로세스의 진입점(`main.go`)입니다. 여기서 하는 일은 딱 "배선(wiring)"입니다: `.env` 로드 → ClickHouse 연결 → 알림 규칙 초기화 → chi 라우터에 미들웨어(Logger, Recoverer, CORS)와 60개 이상의 `/api/v1/...` 라우트 등록 → 임베드된 SPA 정적 파일 서빙 → 리스닝 시작. 비즈니스 로직은 여기 두지 않고 `internal/`로 위임합니다.

### `internal/ch/`
ClickHouse와의 "연결" 그 자체를 책임지는 가장 낮은 계층입니다. `client.go`는 `CH_ADDR`, `CH_DATABASE`, `CH_USER`, `CH_PASSWORD` 환경변수로 커넥션을 열고 패키지 전역 변수 `DB`에 보관합니다. `alert_rules.go`는 알림 규칙 테이블 자체의 DDL(`EnsureAlertRulesTable`)과 기본 CRUD SQL을 담고 있습니다. 이 패키지가 다른 계층보다 한 단계 더 인프라에 가까운 이유는, "어떻게 연결하는가"와 "무엇을 조회하는가"를 분리해두면 커넥션 정책(타임아웃, 재시도 등)을 한곳에서만 바꿀 수 있기 때문으로 보입니다.

### `internal/repository/`
실제 비즈니스 질의 로직, 즉 "어떤 SQL을 어떻게 짜서 ClickHouse에 물어보는가"가 모여 있는 계층입니다. 가장 큰 파일인 `service.go`(1,200줄 이상)는 서비스별 RED(Rate/Error/Duration) 지표를 집계하는 핵심 쿼리를 담고 있고, `outliers.go`는 z-score 기반 이상치 탐지, `cardinality.go`는 속성(attribute) 값 분포 조회를 담당합니다. 이 계층은 `context.Context`를 받아 요청 단위 데드라인을 전파하며, SQL 인젝션을 막기 위해 문자열 포매팅 대신 파라미터 바인딩을 쓰는 패턴이 코드 주석에도 명시되어 있습니다.

### `internal/model/`
HTTP 계층과 저장소 계층이 주고받는 데이터 형태(요청 파라미터, 응답 구조체)를 정의합니다. 여기에 `ParseWindow()` 같은 입력 검증 함수도 같이 둔 것은, "이 값이 유효한가"라는 판단을 모델 레벨에서 한 번 끝내고 그 이후 계층(저장소, SQL)은 이미 검증된 값만 다루도록 하려는 의도로 보입니다.

### `internal/handler/`
HTTP 요청을 받아서 모델로 검증하고, 저장소를 호출하고, JSON으로 응답하는 핸들러들입니다(약 20개 파일, 4,000줄 이상). 기능 영역별로 파일이 나뉘어 있습니다 — 서비스 개요(`service.go`), 트레이스/스팬(`slow_spans.go`, `trace_compare.go`), 로그(`log_volume.go`, `search.go`), 토폴로지/인프라(`infra.go`, `jvm.go`), 알림(`alert.go`), 예측(`forecast.go`), 에러 그룹(`errors.go`), 실시간 스트림(`live.go`), 프로파일링(`profiling.go`), SLO(`slo.go`) 등. `forecast.go`는 외부 예측 서비스(`FORECAST_URL` 환경변수, 기본값은 쿠버네티스 클러스터 내부 주소)로 요청을 위임하는 듬도 보이는데, 이는 예측 로직 자체는 이 레포 밖의 별도 서비스(`javi-forecast`로 추정)에 있다는 뜻입니다.

### `schema/`
ClickHouse 테이블 정의 SQL(`spans.sql`, `metrics.sql`, `logs.sql`)이 있습니다. 모두 OTLP 데이터 모델을 따라가도록 설계되어 있습니다 — `spans.sql`은 트레이스 스팬(트레이스ID/스팬ID/부모스팬ID, 나노초 단위 시작시간과 길이, OTLP status_code), `metrics.sql`은 숫자 데이터포인트(게이지/섬/히스토그램), `logs.sql`은 로그 레코드(심각도, 본문, 트레이스 연관 ID)를 담습니다. 공통적으로 `service_name`처럼 자주 필터링되는 컬럼은 `LowCardinality`로 선언해 압축/쿼리 성능을 높였고, `trace_id`에는 블룸 필터 인덱스를 걸어 특정 트레이스를 빠르게 찾을 수 있게 했습니다. 보존 기간은 30일 TTL로 제한되어 있습니다.

> **주의**: `Makefile`의 `migrate` 타깃은 `migrations/*.sql`을 순회하며 `clickhouse-client`로 실행하지만, 이 글을 쓰는 시점 기준 레포에 `migrations/` 디렉터리는 아직 존재하지 않습니다. 현재 테이블 정의는 `schema/*.sql`에만 있으므로, 실제로 로컬에 스키마를 적용하려면 `schema/*.sql`을 직접 `clickhouse-client`로 실행해야 합니다(또는 `migrations/`를 만들어 그 안으로 옮겨야 `make migrate`가 동작합니다).

### `scripts/`
`integration_test.sh` 하나가 있습니다. 띄워진 서버(기본값 `http://localhost:8099`)에 대해 curl로 `/health`, `/api/v1/ping`부터 Phase 1~6의 주요 엔드포인트(서비스 개요, 트레이스, 로그, 토폴로지, 메트릭, 알림 CRUD 등)를 순서대로 호출해보는 블랙박스 통합 테스트 스크립트입니다. 단위 테스트(Go `_test.go`)와는 별개로, "실제로 떠 있는 서버가 끝에서 끝까지 동작하는가"를 확인하는 용도입니다.

### `web/`
Vite + React 18 + TypeScript 프론트엔드입니다.
- **라우팅**: TanStack Router를 파일 기반으로 사용합니다(`web/src/routes/` 아래 파일 하나당 화면 하나). `services.tsx`, `traces.tsx`, `logs.tsx`, `alerts.tsx`, `forecast.tsx`, `topology.tsx`, `jvm.tsx` 등 30개에 가까운 라우트가 있어, 백엔드의 "Phase별 기능"이 프론트엔드 라우트로 그대로 대응됩니다.
- **상태 관리**: 서버에서 온 데이터는 TanStack Query(React Query)가 캐싱/재조회를 담당하고, 순수 클라이언트 상태(UI 토글 등)는 Zustand로 관리하는 식으로 책임이 나뉘어 있습니다.
- **API 클라이언트**: `web/src/api/client.ts`의 `apiFetch<T>()`가 fetch 래퍼 역할을 하고, 그 위에 `apm.ts`, `forecast.ts`, `aiops.ts`처럼 도메인별 API 함수 모듈이 얹혀 있습니다. 타입은 `web/src/types/`에 도메인별로 정리되어 있습니다.
- **시각화**: 가볍고 빠른 시계열 차트가 필요해서인지 무거운 차트 라이브러리 대신 `uplot`을 쓰고 있고, 스타일은 Tailwind CSS입니다.

### `.github/workflows/`
- `ci.yml`: main에 대한 push/PR마다 프론트엔드 빌드(`npm ci && npm run build`, Go가 임베드할 `web/dist`를 만들기 위해 필수) → Go 빌드/테스트 → TypeScript 타입체크를 순서대로 돌립니다. main에 push되어 테스트를 통과하면 `javi-infra` 레포로 `repository-dispatch` 이벤트를 보내 인프라 빌드를 트리거합니다.
- `sync-claudemd.yml`: main을 향한 PR마다 ① 셸 스크립트로 `CLAUDE.md`의 자동 생성 구간(기술 스택, Make 타깃, 디렉터리 목록)을 기계적으로 갱신하고, ② Claude Code 에이전트가 `git diff origin/main...HEAD`를 보고 `CLAUDE.md`의 서술형 구간을 보강하고, ③ 별도의 Claude Code 에이전트가 바로 이 문서(`docs/ARCHITECTURE.md`)를 생성/갱신합니다. 커밋 메시지에 `[claude-docs]` 태그를 남겨 이 워크플로가 스스로를 무한히 재실행하지 않도록 가드를 걸어둔 점이 눈에 띕니다.

## 5. 로컬 개발 시작하기

**필요한 것**: Go 1.24+, Node 20+, 어딘가에 떠 있는 ClickHouse(로컬 도커든 원격이든), `clickhouse-client` CLI(마이그레이션용).

1. 의존성 설치: `make install` (web/의 npm 패키지 설치). Go 의존성은 `go run`/`go build` 시점에 자동으로 받아집니다.
2. 환경변수 설정: `.env.example`을 참고해 `.env`를 만듭니다.
   ```
   SERVER_PORT=8080
   CH_ADDR=localhost:9000
   CH_DATABASE=apm
   CH_USER=default
   CH_PASSWORD=
   ```
   (`CORS_ALLOWED_ORIGINS`도 필요시 설정 가능하며, 기본값은 `*`입니다.)
3. ClickHouse에 스키마 적용: 현재는 `migrations/` 디렉터리가 없으므로, `schema/*.sql`을 직접 `clickhouse-client`로 실행해 `apm.spans`, `apm.metrics`, `apm.logs` 테이블을 만들어야 합니다.
4. 서버+프론트 동시 실행: `make dev` (내부적으로 `make -j2 dev-api dev-web`로 두 프로세스를 병렬 실행). 따로 실행하려면 `make dev-api`(Go만), `make dev-web`(Vite만)을 쓸 수 있습니다.
5. 브라우저에서 Vite dev 서버(기본 5173 포트)에 접속하면 됩니다. `/api`, `/health` 요청은 Vite가 자동으로 백엔드로 프록시합니다.
6. 검증 명령: Go 테스트는 `make test`, 프론트 타입체크는 `make typecheck`. 서버가 떠 있는 상태에서 더 폭넓게 확인하려면 `./scripts/integration_test.sh`를 돌려볼 수 있습니다.

## 6. 알아두면 좋은 함정·주의사항

- **Vite 프록시 포트와 서버 기본 포트가 다릅니다.** `web/vite.config.ts`의 dev 프록시는 `http://localhost:8090`을 가리키는데, `.env.example`과 `main.go`의 `SERVER_PORT` 기본값은 `8080`입니다. 둘을 맞추지 않으면 로컬에서 `make dev`로 띄웠을 때 프론트엔드가 API를 못 찾습니다 — `.env`에 `SERVER_PORT=8090`을 명시하거나 `vite.config.ts`의 타깃을 `8080`으로 바꿔야 합니다.
- **프론트엔드를 먼저 빌드해야 Go가 빌드됩니다.** `cmd/server/main.go`가 `//go:embed web/dist`로 빌드 결과물을 통째로 끌어안는 구조라서, `web/dist`가 없으면 `go build`/`go run`이 실패합니다. `make dev`는 두 프로세스를 병렬로 띄우므로 이 문제가 없지만(Vite가 직접 서빙), 운영 빌드(`make build`, `Dockerfile`)에서는 반드시 `npm run build`가 먼저 끝나 있어야 합니다. CI(`ci.yml`)도 이 순서를 강제합니다.
- **`make migrate`가 가리키는 `migrations/` 디렉터리는 아직 존재하지 않습니다.** 위 4절에서 설명했듯, 현재 스키마의 단일 진실 공급원은 `schema/*.sql`입니다. 새 테이블이나 컬럼을 추가할 때 이 불일치를 어떻게 정리할지(스키마를 `migrations/`로 옮기거나, Makefile을 `schema/`를 보도록 고치는 등) 합의가 필요합니다.
- **시간 윈도우는 화이트리스트로만 받습니다.** `5m|15m|1h|6h|24h` 이외의 값은 `ParseWindow()`에서 막힙니다. 새로운 윈도우 옵션이 필요하면 이 화이트리스트를 직접 넓혀야 합니다(쿼리 문자열에 임의 값을 그대로 흘려보내는 식으로 우회하면 SQL 인젝션 위험이 생깁니다).
- **모든 쿼리에 10초 타임아웃이 걸려 있습니다.** 무거운 집계(예: 카디널리티가 큰 속성 breakdown)를 추가할 때 이 타임아웃 안에 끝나는지 항상 확인해야 합니다.
- **알림 규칙은 메모리 캐시 + ClickHouse 이중 구조입니다.** 서버를 여러 인스턴스로 수평 확장하면, 각 인스턴스가 각자 캐시를 들고 있어서 한 인스턴스에서 알림 규칙을 수정해도 다른 인스턴스에는 바로 반영되지 않을 수 있습니다(현재는 단일 인스턴스 가정으로 보입니다).
- **데이터 보존은 30일입니다.** `schema/*.sql`의 TTL이 30일로 박혀 있으므로, 장기 트렌드/예측 기능(`forecast.go`)을 다룰 때는 원본 스팬/메트릭이 아니라 별도의 다운샘플링된 데이터나 외부 예측 서비스(`FORECAST_URL`)에 의존하고 있을 가능성을 염두에 둬야 합니다.
- **`forecast.go`는 외부 서비스로 위임합니다.** 예측 관련 핸들러는 자체 계산이 아니라 `FORECAST_URL`(쿠버네티스 환경 기본값: `javi-forecast` 서비스)로 요청을 전달하는 구조입니다. 즉 예측 로직 자체를 디버깅해야 한다면 이 레포가 아니라 그 외부 서비스를 봐야 할 수 있습니다.
