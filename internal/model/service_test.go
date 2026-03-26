package model

import (
	"testing"
	"time"
)

func TestParseWindow(t *testing.T) {
	cases := []struct {
		input   string
		wantWP  WindowParam
		wantDur time.Duration
		wantOK  bool
	}{
		{"5m", Window5m, 5 * time.Minute, true},
		{"15m", Window15m, 15 * time.Minute, true},
		{"1h", Window1h, time.Hour, true},
		{"6h", Window6h, 6 * time.Hour, true},
		{"24h", Window24h, 24 * time.Hour, true},
		{"", Window5m, 5 * time.Minute, false},
		{"30m", Window5m, 5 * time.Minute, false},
		{"1d", Window5m, 5 * time.Minute, false},
		{"'; DROP TABLE spans; --", Window5m, 5 * time.Minute, false},
	}

	for _, tc := range cases {
		t.Run(tc.input, func(t *testing.T) {
			wp, dur, ok := ParseWindow(tc.input)
			if ok != tc.wantOK {
				t.Errorf("ParseWindow(%q) ok=%v, want %v", tc.input, ok, tc.wantOK)
			}
			if ok {
				if wp != tc.wantWP {
					t.Errorf("ParseWindow(%q) wp=%q, want %q", tc.input, wp, tc.wantWP)
				}
				if dur != tc.wantDur {
					t.Errorf("ParseWindow(%q) dur=%v, want %v", tc.input, dur, tc.wantDur)
				}
			}
		})
	}
}

func TestParseStep(t *testing.T) {
	cases := []struct {
		input   string
		wantLbl string
		wantDur time.Duration
		wantOK  bool
	}{
		{"1m", "1m", time.Minute, true},
		{"5m", "5m", 5 * time.Minute, true},
		{"15m", "15m", 15 * time.Minute, true},
		{"1h", "1h", time.Hour, true},
		{"", "", 0, false},
		{"2m", "", 0, false},
		{"30s", "", 0, false},
	}

	for _, tc := range cases {
		t.Run(tc.input, func(t *testing.T) {
			lbl, dur, ok := ParseStep(tc.input)
			if ok != tc.wantOK {
				t.Errorf("ParseStep(%q) ok=%v, want %v", tc.input, ok, tc.wantOK)
			}
			if ok {
				if lbl != tc.wantLbl {
					t.Errorf("ParseStep(%q) label=%q, want %q", tc.input, lbl, tc.wantLbl)
				}
				if dur != tc.wantDur {
					t.Errorf("ParseStep(%q) dur=%v, want %v", tc.input, dur, tc.wantDur)
				}
			}
		})
	}
}
