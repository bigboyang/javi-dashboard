import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  fetchForecastRed,
  fetchForecastService,
  fetchForecastCapacity,
  fetchForecastAnomalies,
} from '../api/forecast'

const mockJson = vi.fn()
const mockFetch = vi.fn()

beforeEach(() => {
  mockJson.mockReset()
  mockFetch.mockReset()
  mockFetch.mockResolvedValue({ ok: true, json: mockJson })
  vi.stubGlobal('fetch', mockFetch)
})

describe('fetchForecastRed', () => {
  it('calls /api/v1/forecast/red', async () => {
    mockJson.mockResolvedValue({ services: [] })
    await fetchForecastRed()
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/forecast/red')
  })
})

describe('fetchForecastService', () => {
  it('defaults metric to "all"', async () => {
    mockJson.mockResolvedValue([])
    await fetchForecastService('payments')
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/forecast/service/payments?metric=all')
  })

  it('accepts custom metric', async () => {
    mockJson.mockResolvedValue([])
    await fetchForecastService('payments', 'rate')
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/forecast/service/payments?metric=rate')
  })

  it('URL-encodes service name', async () => {
    mockJson.mockResolvedValue([])
    await fetchForecastService('order service', 'all')
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/forecast/service/order%20service?metric=all')
  })
})

describe('fetchForecastCapacity', () => {
  it('calls /api/v1/forecast/capacity', async () => {
    mockJson.mockResolvedValue({ items: [] })
    await fetchForecastCapacity()
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/forecast/capacity')
  })
})

describe('fetchForecastAnomalies', () => {
  it('calls without severity param when not provided', async () => {
    mockJson.mockResolvedValue({ anomalies: [] })
    await fetchForecastAnomalies()
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/forecast/anomalies')
  })

  it('appends severity param when provided', async () => {
    mockJson.mockResolvedValue({ anomalies: [] })
    await fetchForecastAnomalies('critical')
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/forecast/anomalies?severity=critical')
  })
})
