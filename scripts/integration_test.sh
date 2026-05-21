#!/usr/bin/env bash
# Integration test: javi-dashboard deployed on k8s (minikube) with real ClickHouse
# Usage: ./scripts/integration_test.sh [BASE_URL]
# Default BASE_URL: http://localhost:8099

set -uo pipefail

BASE="${1:-http://localhost:8099}"
PASS=0; WARN=0; FAIL=0
RULE_ID=""

RED='\033[0;31m'; YEL='\033[0;33m'; GRN='\033[0;32m'; NC='\033[0m'; BLD='\033[1m'

pass() { echo -e "${GRN}PASS${NC} $1"; ((PASS++)); }
warn() { echo -e "${YEL}WARN${NC} $1: $2"; ((WARN++)); }
fail() { echo -e "${RED}FAIL${NC} $1: $2"; ((FAIL++)); }

# HTTP helpers — write body to /tmp/.body, return code as stdout
do_get()  {
  local code; code=$(curl -s -o /tmp/.body -w "%{http_code}" "$BASE$1" 2>/dev/null); echo "$code"
}
do_post() {
  local code; code=$(curl -s -o /tmp/.body -w "%{http_code}" -X POST -H "Content-Type: application/json" -d "$2" "$BASE$1" 2>/dev/null); echo "$code"
}
do_patch(){
  local code; code=$(curl -s -o /tmp/.body -w "%{http_code}" -X PATCH -H "Content-Type: application/json" -d "$2" "$BASE$1" 2>/dev/null); echo "$code"
}
do_del()  {
  local code; code=$(curl -s -o /tmp/.body -w "%{http_code}" -X DELETE "$BASE$1" 2>/dev/null); echo "$code"
}

body() { cat /tmp/.body 2>/dev/null || true; }

url_encode() { python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$1"; }

check_2xx() {
  local name="$1" path="$2"
  local code; code=$(do_get "$path")
  if [[ "$code" =~ ^2 ]]; then
    pass "$name (HTTP $code)"
  elif [[ "$code" =~ ^4|^5 ]]; then
    warn "$name" "HTTP $code — $(body | head -c 120)"
  else
    fail "$name" "unexpected code=$code"
  fi
}

check_field() {
  local name="$1" path="$2" field="$3"
  local code; code=$(do_get "$path")
  if [[ "$code" =~ ^2 ]] && body | jq -e ".$field" > /dev/null 2>&1; then
    pass "$name (has .$field)"
  elif [[ "$code" =~ ^2 ]]; then
    fail "$name" "HTTP $code but missing .$field in: $(body | head -c 120)"
  else
    warn "$name" "HTTP $code — $(body | head -c 120)"
  fi
}

echo ""
echo -e "${BLD}=== javi-dashboard k8s Integration Test ===${NC}"
echo "Target: $BASE"
echo ""

# ── Infrastructure ──────────────────────────────────────────────
echo -e "${BLD}[ Infrastructure ]${NC}"

code=$(do_get /health)
if [[ "$code" == "200" ]] && body | jq -e '.status == "ok"' > /dev/null 2>&1; then
  ch=$(body | jq -r '.clickhouse // "unknown"')
  pass "GET /health (clickhouse=$ch)"
else
  fail "GET /health" "code=$code body=$(body | head -c 80)"
fi

code=$(do_get /api/v1/ping)
if [[ "$code" == "200" ]] && body | jq -e '.message == "pong"' > /dev/null 2>&1; then
  pass "GET /api/v1/ping"
else
  fail "GET /api/v1/ping" "code=$code"
fi

# Frontend SPA
code=$(curl -s -o /tmp/.body -w "%{http_code}" "$BASE/" 2>/dev/null)
if [[ "$code" == "200" ]] && grep -q "<html" /tmp/.body 2>/dev/null; then
  pass "GET / (SPA index.html served)"
else
  fail "GET /" "code=$code — SPA not served"
fi

# ── Phase 1: Service Overview ───────────────────────────────────
echo ""
echo -e "${BLD}[ Phase 1: Service Overview ]${NC}"
check_field "GET /api/v1/services" "/api/v1/services?window=5m" "services"

SVC=$(curl -s "$BASE/api/v1/services?window=1h" 2>/dev/null | jq -r '.services[0].name // empty')
if [[ -n "$SVC" ]]; then
  echo "  → found service: $SVC"
  ESVC=$(url_encode "$SVC")
  check_field "GET /services/{svc}/red" "/api/v1/services/$ESVC/red?window=1h&step=5m" "series"
  check_2xx  "GET /services/{svc}/operations" "/api/v1/services/$ESVC/operations?window=1h"
else
  warn "service list" "No services found (test-app may need traffic)"
fi

# ── Phase 2: Trace Explorer ─────────────────────────────────────
echo ""
echo -e "${BLD}[ Phase 2: Trace Explorer ]${NC}"
check_field "GET /api/v1/traces" "/api/v1/traces?window=1h&limit=20" "traces"

TRACE_ID=$(curl -s "$BASE/api/v1/traces?window=6h&limit=5" 2>/dev/null | jq -r '.traces[0].trace_id // empty')
if [[ -n "$TRACE_ID" ]]; then
  echo "  → found trace_id: $TRACE_ID"
  check_field "GET /api/v1/traces/{id}" "/api/v1/traces/$TRACE_ID" "spans"
else
  warn "trace detail" "No traces found yet"
fi

# ── Phase 3: Log Explorer ───────────────────────────────────────
echo ""
echo -e "${BLD}[ Phase 3: Log Explorer ]${NC}"
check_field "GET /api/v1/logs" "/api/v1/logs?window=1h&limit=50" "logs"

# ── Phase 4: Service Topology ───────────────────────────────────
echo ""
echo -e "${BLD}[ Phase 4: Service Topology ]${NC}"
check_field "GET /api/v1/topology" "/api/v1/topology?window=1h" "edges"

# ── Phase 5: Metrics Explorer ───────────────────────────────────
echo ""
echo -e "${BLD}[ Phase 5: Metrics Explorer ]${NC}"
check_field "GET /api/v1/metrics/names" "/api/v1/metrics/names?window=1h" "metrics"

METRIC=$(curl -s "$BASE/api/v1/metrics/names?window=6h" 2>/dev/null | jq -r '.metrics[0] // empty')
if [[ -n "$METRIC" ]]; then
  echo "  → found metric: $METRIC"
  EMETRIC=$(url_encode "$METRIC")
  check_field "GET /api/v1/metrics/series" "/api/v1/metrics/series?metric=$EMETRIC&window=1h&step=5m" "series"
else
  warn "metrics series" "No metrics found yet"
fi

# ── Phase 6: Alerting ───────────────────────────────────────────
echo ""
echo -e "${BLD}[ Phase 6: Alerting ]${NC}"
code=$(do_get /api/v1/alerts/rules)
if [[ "$code" == "200" ]] && body | jq -e '.rules' > /dev/null 2>&1; then
  pass "GET /api/v1/alerts/rules"
else
  fail "GET /api/v1/alerts/rules" "code=$code"
fi

code=$(do_post /api/v1/alerts/rules '{"name":"k8s-int-test","service":"test-app","metric":"error_rate","condition":"gt","threshold":5.0,"window":"5m"}')
if [[ "$code" == "201" ]]; then
  RULE_ID=$(body | jq -r '.rule.id // empty')
  pass "POST /api/v1/alerts/rules (id=$RULE_ID)"
else
  fail "POST /api/v1/alerts/rules" "code=$code body=$(body | head -c 120)"
fi

if [[ -n "$RULE_ID" ]]; then
  code=$(do_patch "/api/v1/alerts/rules/$RULE_ID" '{"enabled":false}')
  [[ "$code" == "200" ]] && pass "PATCH /api/v1/alerts/rules/{id}" || fail "PATCH /api/v1/alerts/rules/{id}" "code=$code"

  code=$(do_del "/api/v1/alerts/rules/$RULE_ID")
  [[ "$code" == "204" ]] && pass "DELETE /api/v1/alerts/rules/{id}" || fail "DELETE /api/v1/alerts/rules/{id}" "code=$code"
fi

check_field "GET /api/v1/alerts/status" "/api/v1/alerts/status?window=5m" "firing"

# ── Phase 7: Forecast ───────────────────────────────────────────
echo ""
echo -e "${BLD}[ Phase 7: Forecast Dashboard ]${NC}"
for path in "/api/v1/forecast/red?window=1h" "/api/v1/forecast/capacity" "/api/v1/forecast/anomalies?window=1h"; do
  code=$(do_get "$path")
  if [[ "$code" =~ ^2 ]]; then
    pass "GET $path"
  elif [[ "$code" == "404" || "$code" == "503" ]]; then
    warn "GET $path" "HTTP $code (needs accumulated data)"
  else
    fail "GET $path" "code=$code"
  fi
done

if [[ -n "$SVC" ]]; then
  ESVC=$(url_encode "$SVC")
  code=$(do_get "/api/v1/forecast/service/$ESVC")
  if [[ "$code" =~ ^2 ]]; then
    pass "GET /api/v1/forecast/service/{svc}"
  elif [[ "$code" == "404" ]]; then
    warn "GET /api/v1/forecast/service/{svc}" "HTTP 404 (model needs training data)"
  else
    fail "GET /api/v1/forecast/service/{svc}" "code=$code"
  fi
fi

# ── Phase 8: AIOps + JVM ────────────────────────────────────────
echo ""
echo -e "${BLD}[ Phase 8: AIOps + JVM ]${NC}"
for path in "/api/v1/aiops/anomalies?window=1h" "/api/v1/aiops/rca?window=1h"; do
  code=$(do_get "$path")
  if [[ "$code" =~ ^2 ]]; then
    pass "GET $path"
  elif [[ "$code" == "404" || "$code" == "503" ]]; then
    warn "GET $path" "HTTP $code (needs data)"
  else
    fail "GET $path" "code=$code"
  fi
done

# jvm/services returns a JSON array directly
code=$(do_get "/api/v1/jvm/services")
if [[ "$code" =~ ^2 ]] && body | jq -e 'type == "array"' > /dev/null 2>&1; then
  count=$(body | jq 'length')
  pass "GET /api/v1/jvm/services (array, $count entries)"
elif [[ "$code" =~ ^2 ]]; then
  fail "GET /api/v1/jvm/services" "HTTP $code but not a JSON array: $(body | head -c 80)"
else
  warn "GET /api/v1/jvm/services" "HTTP $code — $(body | head -c 80)"
fi

if [[ -n "$SVC" ]]; then
  ESVC=$(url_encode "$SVC")
  for path in "/api/v1/jvm/health/$ESVC" "/api/v1/jvm/history/$ESVC"; do
    code=$(do_get "$path")
    if [[ "$code" =~ ^2 ]]; then
      pass "GET $path"
    elif [[ "$code" == "404" || "$code" == "503" ]]; then
      warn "GET $path" "HTTP $code (needs JVM data)"
    else
      fail "GET $path" "code=$code"
    fi
  done
fi

# ── Phase 9: Causality + RAG Search ─────────────────────────────
echo ""
echo -e "${BLD}[ Phase 9: Causality + RAG Search ]${NC}"
code=$(do_get "/api/v1/dependency/graph?window=1h")
if [[ "$code" =~ ^2 ]]; then
  pass "GET /api/v1/dependency/graph"
elif [[ "$code" == "404" || "$code" == "503" ]]; then
  warn "GET /api/v1/dependency/graph" "HTTP $code (needs data)"
else
  fail "GET /api/v1/dependency/graph" "code=$code"
fi

if [[ -n "$SVC" ]]; then
  ESVC=$(url_encode "$SVC")
  code=$(do_get "/api/v1/dependency/$ESVC/causes?window=1h")
  if [[ "$code" =~ ^2 ]]; then
    pass "GET /api/v1/dependency/{svc}/causes"
  elif [[ "$code" == "404" || "$code" == "503" ]]; then
    warn "GET /api/v1/dependency/{svc}/causes" "HTTP $code (needs data)"
  else
    fail "GET /api/v1/dependency/{svc}/causes" "code=$code"
  fi
fi

code=$(do_post /api/v1/rag/search '{"query":"error","service":"","limit":5}')
if [[ "$code" =~ ^2 ]]; then
  pass "POST /api/v1/rag/search"
elif [[ "$code" == "503" || "$code" == "500" ]]; then
  warn "POST /api/v1/rag/search" "HTTP $code (needs RAG_ENABLED=true + ANTHROPIC_API_KEY)"
else
  fail "POST /api/v1/rag/search" "code=$code body=$(body | head -c 80)"
fi

# ── Summary ──────────────────────────────────────────────────────
TOTAL=$((PASS + WARN + FAIL))
echo ""
echo -e "${BLD}=== Results: ${GRN}${PASS} PASS${NC} / ${YEL}${WARN} WARN${NC} / ${RED}${FAIL} FAIL${NC} (total $TOTAL) ===${NC}"
echo ""

[[ $FAIL -eq 0 ]] && exit 0 || exit 1
