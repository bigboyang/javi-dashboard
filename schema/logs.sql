-- ClickHouse DDL for OTLP-compatible logs storage
-- Database: apm
-- Engine: MergeTree with TTL for automatic data expiry

CREATE DATABASE IF NOT EXISTS apm;

CREATE TABLE IF NOT EXISTS apm.logs
(
    -- Timing: nanoseconds since Unix epoch (matches OTLP LogRecord.time_unix_nano)
    timestamp_nano  Int64,

    -- Service identifier (low cardinality for efficient compression and filtering)
    service_name    LowCardinality(String),

    -- OTLP severity: text label (INFO, WARN, ERROR …) and numeric code (1-24)
    severity_text   LowCardinality(String),
    severity_number UInt8,

    -- Log body — the human-readable message string
    body            String,

    -- Trace context for correlation with the trace explorer
    trace_id        String,
    span_id         String,

    -- Generic attribute maps for arbitrary OTLP resource/log attributes
    resource_attrs  Map(String, String),
    log_attrs       Map(String, String)
)
ENGINE = MergeTree()
-- Partition by day: mirrors the spans table partitioning strategy
PARTITION BY toDate(fromUnixTimestamp64Nano(timestamp_nano))
-- Primary sort key: (service_name, timestamp_nano) satisfies the two most
-- common access patterns:
--   1. All logs for a service in a time range
--   2. Most-recent-first log streams
ORDER BY (service_name, timestamp_nano)
-- TTL: auto-expire raw logs after 30 days.
TTL toDate(fromUnixTimestamp64Nano(timestamp_nano)) + INTERVAL 30 DAY
SETTINGS
    index_granularity = 8192;

-- Bloom filter on trace_id to make trace-correlation lookups fast.
ALTER TABLE apm.logs
    ADD INDEX idx_trace_id trace_id TYPE bloom_filter(0.01) GRANULARITY 4;
