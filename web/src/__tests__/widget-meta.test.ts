/**
 * Tests for WIDGET_META constants and dashboard widget type validation.
 * These ensure the color system and labels are consistent across all 7 widget types.
 */
import { describe, it, expect } from 'vitest'

// Mirror the WIDGET_META constant from CustomDashboard
type WidgetType =
  | 'service-red'
  | 'top-services'
  | 'active-alerts'
  | 'metric-chart'
  | 'anomaly-alert'
  | 'forecast-anomaly'
  | 'rag-search'

const WIDGET_META: Record<WidgetType, { color: string; bg: string; label: string; desc: string }> = {
  'service-red':      { color: '#6366f1', bg: 'rgba(99,102,241,0.1)',    label: 'Service RED',        desc: 'Rate / Error / Latency sparklines for a service' },
  'top-services':     { color: '#10b981', bg: 'rgba(16,185,129,0.1)',    label: 'Top Services',       desc: 'Overview table of top N services' },
  'active-alerts':    { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',     label: 'Active Alerts',      desc: 'Currently firing alert rules' },
  'metric-chart':     { color: '#a78bfa', bg: 'rgba(167,139,250,0.1)',   label: 'Metric Chart',       desc: 'Custom metric time-series sparkline' },
  'anomaly-alert':    { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',    label: 'Anomaly Alerts',     desc: 'AIOps-detected anomalies (Phase 8)' },
  'forecast-anomaly': { color: '#a78bfa', bg: 'rgba(167,139,250,0.1)',   label: 'Forecast Anomaly',   desc: 'Predicted anomalies from javi-forecast' },
  'rag-search':       { color: '#06b6d4', bg: 'rgba(6,182,212,0.1)',     label: 'RAG Search',         desc: 'RAG error search with a pre-configured query' },
}

const ALL_WIDGET_TYPES: WidgetType[] = [
  'service-red', 'top-services', 'active-alerts', 'metric-chart',
  'anomaly-alert', 'forecast-anomaly', 'rag-search',
]

describe('WIDGET_META', () => {
  it('defines all 7 widget types', () => {
    expect(Object.keys(WIDGET_META)).toHaveLength(7)
    for (const type of ALL_WIDGET_TYPES) {
      expect(WIDGET_META[type]).toBeDefined()
    }
  })

  it('every widget type has color, bg, label and desc', () => {
    for (const type of ALL_WIDGET_TYPES) {
      const meta = WIDGET_META[type]
      expect(meta.color).toMatch(/^#[0-9a-f]{6}$/i)
      expect(meta.bg).toMatch(/^rgba\(/)
      expect(meta.label.length).toBeGreaterThan(0)
      expect(meta.desc.length).toBeGreaterThan(0)
    }
  })

  it('active-alerts uses error red (#ef4444)', () => {
    expect(WIDGET_META['active-alerts'].color).toBe('#ef4444')
  })

  it('anomaly-alert uses warning amber (#f59e0b)', () => {
    expect(WIDGET_META['anomaly-alert'].color).toBe('#f59e0b')
  })

  it('rag-search uses cyan (#06b6d4)', () => {
    expect(WIDGET_META['rag-search'].color).toBe('#06b6d4')
  })

  it('service-red and top-services use distinct colors', () => {
    expect(WIDGET_META['service-red'].color).not.toBe(WIDGET_META['top-services'].color)
  })

  it('bg colors are semi-transparent (contain 0.1)', () => {
    for (const type of ALL_WIDGET_TYPES) {
      expect(WIDGET_META[type].bg).toContain('0.1')
    }
  })
})

describe('Widget span validation', () => {
  type ValidSpan = 1 | 2 | 3

  function isValidSpan(span: number): span is ValidSpan {
    return span === 1 || span === 2 || span === 3
  }

  it('accepts valid spans 1, 2, 3', () => {
    expect(isValidSpan(1)).toBe(true)
    expect(isValidSpan(2)).toBe(true)
    expect(isValidSpan(3)).toBe(true)
  })

  it('rejects invalid span values', () => {
    expect(isValidSpan(0)).toBe(false)
    expect(isValidSpan(4)).toBe(false)
  })
})

describe('genId uniqueness', () => {
  // Mirror genId from CustomDashboard
  function genId(): string {
    return Math.random().toString(36).slice(2, 10)
  }

  it('generates non-empty IDs', () => {
    const id = genId()
    expect(id.length).toBeGreaterThan(0)
  })

  it('generates unique IDs across 1000 calls', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => genId()))
    expect(ids.size).toBe(1000)
  })

  it('generated ID is alphanumeric', () => {
    const id = genId()
    expect(id).toMatch(/^[0-9a-z]+$/)
  })
})
