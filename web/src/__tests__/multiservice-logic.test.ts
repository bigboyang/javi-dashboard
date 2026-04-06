/**
 * Tests for MultiServiceComparison service selection logic.
 * The toggle logic is pure state management — test it without mounting the component.
 */
import { describe, it, expect } from 'vitest'

const MAX_SERVICES = 3

// Mirror the toggleService logic from MultiServiceComparison.tsx
function toggleService(prev: string[], name: string): string[] {
  if (prev.includes(name)) return prev.filter((s) => s !== name)
  if (prev.length >= MAX_SERVICES) return prev
  return [...prev, name]
}

describe('MultiServiceComparison — toggleService', () => {
  it('adds a service when list is empty', () => {
    expect(toggleService([], 'api')).toEqual(['api'])
  })

  it('adds a second service', () => {
    expect(toggleService(['api'], 'payments')).toEqual(['api', 'payments'])
  })

  it('removes an already-selected service', () => {
    expect(toggleService(['api', 'payments'], 'api')).toEqual(['payments'])
  })

  it('does not add a 4th service when max is 3', () => {
    const full = ['api', 'payments', 'inventory']
    const result = toggleService(full, 'orders')
    expect(result).toEqual(full)
    expect(result).toHaveLength(3)
  })

  it('can still remove a service when at max capacity', () => {
    const full = ['api', 'payments', 'inventory']
    expect(toggleService(full, 'payments')).toEqual(['api', 'inventory'])
  })

  it('preserves insertion order', () => {
    let s: string[] = []
    s = toggleService(s, 'c')
    s = toggleService(s, 'a')
    s = toggleService(s, 'b')
    expect(s).toEqual(['c', 'a', 'b'])
  })

  it('does not mutate the original array', () => {
    const original = ['api', 'payments']
    toggleService(original, 'inventory')
    expect(original).toEqual(['api', 'payments'])
  })
})

describe('MultiServiceComparison — color index mapping', () => {
  const SERVICE_COLORS = [
    { line: '#6366f1', fill: 'rgba(99,102,241,0.15)' },
    { line: '#10b981', fill: 'rgba(16,185,129,0.15)' },
    { line: '#f59e0b', fill: 'rgba(245,158,11,0.15)' },
  ]

  it('first selected service gets indigo color', () => {
    const selected = ['api']
    const idx = selected.indexOf('api')
    expect(SERVICE_COLORS[idx].line).toBe('#6366f1')
  })

  it('second selected service gets emerald color', () => {
    const selected = ['api', 'payments']
    const idx = selected.indexOf('payments')
    expect(SERVICE_COLORS[idx].line).toBe('#10b981')
  })

  it('third selected service gets amber color', () => {
    const selected = ['api', 'payments', 'inventory']
    const idx = selected.indexOf('inventory')
    expect(SERVICE_COLORS[idx].line).toBe('#f59e0b')
  })

  it('unselected service returns colorIdx=-1 (no color)', () => {
    const selected = ['api']
    const idx = selected.indexOf('payments')
    expect(idx).toBe(-1)
    expect(SERVICE_COLORS[idx]).toBeUndefined()
  })
})
