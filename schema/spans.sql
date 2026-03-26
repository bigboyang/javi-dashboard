-- ClickHouse DDL for OTLP-compatible spans storage
-- Database: apm
-- Engine: MergeTree with TTL for automatic data expiry

CREATE DATABASE IF NOT EXISTS apm;

CREATE TABLE IF NOT EXISTS apm.spans
(
    -- Trace identity
    trace_id        String,
    span_id         String,
    parent_span_id  String,

    -- Service and operation (low cardinality for efficient compression and filtering)
    service_name    LowCardinality(String),
    operation_name  LowCardinality(String),

    -- Timing: start_time stored as DateTime64(9) = nanosecond precision
    -- duration_ns: span duration in nanoseconds (UInt64 avoids negative clock skew values)
    start_time      DateTime64(9, 'UTC'),
    duration_ns     UInt64,

    -- OTLP StatusCode: 0=STATUS_CODE_UNSET, 1=STATUS_CODE_OK, 2=STATUS_CODE_ERROR
    status_code     UInt8,

    -- HTTP semantic conventions (OTLP span attributes promoted to columns for query efficiency)
    http_method      LowCardinality(String),
    http_status_code UInt16,
    http_url         String,

    -- Generic attribute maps for arbitrary OTLP resource/span attributes
    -- Map(String, String) avoids schema migrations for new attribute keys
    resource_attrs  Map(String, String),
    span_attrs      Map(String, String)
)
ENGINE = MergeTree()
-- Partition by day: balances part count vs. retention granularity
-- Avoid hourly partitions at high ingest rates (too many parts)
PARTITION BY toDate(start_time)
-- Primary sort key: (service_name, start_time) satisfies the two most common
-- access patterns:
--   1. Aggregate all spans for a service in a time range (service overview)
--   2. Drill into a time window for RED time-series
-- operation_name included so operation-level queries can skip-scan without
-- a full service scan when both predicates are present.
ORDER BY (service_name, toStartOfMinute(start_time), operation_name, span_id)
-- TTL: auto-expire raw spans after 30 days to control storage growth.
-- Adjust to match your retention SLA.
TTL toDate(start_time) + INTERVAL 30 DAY
SETTINGS
    index_granularity = 8192,
    -- Merge parts aggressively to reduce query fan-out
    merge_max_block_size = 8192;

-- Bloom filter skipping index on trace_id for point lookups by trace
-- (e.g. trace detail pages). This does not affect the RED aggregation queries.
ALTER TABLE apm.spans
    ADD INDEX idx_trace_id trace_id TYPE bloom_filter(0.01) GRANULARITY 4;
