package ch

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
)

var DB driver.Conn

func Connect() error {
	addr := os.Getenv("CH_ADDR")
	if addr == "" {
		addr = "localhost:9000"
	}
	db := os.Getenv("CH_DATABASE")
	if db == "" {
		db = "apm"
	}

	conn, err := clickhouse.Open(&clickhouse.Options{
		Addr: []string{addr},
		Auth: clickhouse.Auth{
			Database: db,
			Username: os.Getenv("CH_USER"),
			Password: os.Getenv("CH_PASSWORD"),
		},
		DialTimeout:     5 * time.Second,
		ConnMaxLifetime: time.Hour,
		Compression: &clickhouse.Compression{
			Method: clickhouse.CompressionLZ4,
		},
	})
	if err != nil {
		return fmt.Errorf("clickhouse open: %w", err)
	}
	if err := conn.Ping(context.Background()); err != nil {
		return fmt.Errorf("clickhouse ping: %w", err)
	}
	DB = conn
	return nil
}
