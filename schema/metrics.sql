-- ClickHouse DDL for OTLP-compatible metrics storage
-- Database: apm
-- Engine: MergeTree with TTL for automatic data expiry

CREATE DATABASE IF NOT EXISTS apm;

CREATE TABLE IF NOT EXISTS apm.metrics
(
    -- Timing: nanoseconds since Unix epoch (matches OTLP NumberDataPoint.time_unix_nano)
    timestamp_nano  Int64,

    -- Service identifier
    service_name    LowCardinality(String),

    -- Metric identity
    metric_name     LowCardinality(String),

    -- OTLP metric instrument type: "gauge", "sum", "histogram"
    metric_type     LowCardinality(String),

    -- Numeric value of the data point
    -- For histograms this stores the sum; bucket data is stored in attributes
    value           Float64,

    -- Generic attribute map for metric dimensions/labels
    attributes      Map(String, String)
)
ENGINE = MergeTree()
-- Partition by day to align with spans and logs retention strategy
PARTITION BY toDate(fromUnixTimestamp64Nano(timestamp_nano))
-- Primary sort key: (service_name, metric_name, timestamp_nano) satisfies
-- the two most common access patterns:
--   1. List all metrics for a service in a time range
--   2. Time-series data for a specific metric within a service
ORDER BY (service_name, metric_name, timestamp_nano)
-- TTL: auto-expire raw metric data after 30 days
TTL toDate(fromUnixTimestamp64Nano(timestamp_nano)) + INTERVAL 30 DAY
SETTINGS
    index_granularity = 8192;
