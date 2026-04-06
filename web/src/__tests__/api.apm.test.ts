import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  fetchServices,
  fetchServiceRed,
  fetchTraces,
  fetchTraceDetail,
  fetchLogs,
  fetchTopology,
  fetchMetricNames,
  fetchMetricSeries,
  fetchAlertRules,
  fetchAlertStatus,
  createAlertRule,
  deleteAlertRule,
} from '../api/apm'

const mockJson = vi.fn()
const mockFetch = vi.fn()

beforeEach(() => {
  mockJson.mockReset()
  mockFetch.mockReset()
  mockFetch.mockResolvedValue({ ok: true, json: mockJson })
  vi.stubGlobal('fetch', mockFetch)
})

describe('fetchServices', () => {
  it('calls correct URL with window param', async () => {
    mockJson.mockResolvedValue({ services: [], window: '5m', generated_at: '' })
    await fetchServices('5m')
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/services?window=5m')
  })

  it('URL-encodes the window value', async () => {
    mockJson.mockResolvedValue({ services: [], window: '1h', generated_at: '' })
    await fetchServices('1h')
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/services?window=1h')
  })
})

describe('fetchServiceRed', () => {
  it('builds correct path with service, window and step', async () => {
    mockJson.mockResolvedValue({ service: 'svc', window: '1h', step: '1m', series: [] })
    await fetchServiceRed('my-service', '1h', '1m')
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/services/my-service/red?window=1h&step=1m',
    )
  })

  it('URL-encodes service name with spaces', async () => {
    mockJson.mockResolvedValue({ service: 'order service', window: '6h', step: '5m', series: [] })
    await fetchServiceRed('order service', '6h', '5m')
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/services/order%20service/red?window=6h&step=5m',
    )
  })
})

describe('fetchTraces', () => {
  it('builds URL without optional service', async () => {
    mockJson.mockResolvedValue({ traces: [], window: '5m', total: 0 })
    await fetchTraces('5m')
    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('/api/v1/traces')
    expect(url).toContain('window=5m')
    expect(url).toContain('limit=100')
    expect(url).not.toContain('service=')
  })

  it('includes service param when provided', async () => {
    mockJson.mockResolvedValue({ traces: [], window: '1h', total: 0 })
    await fetchTraces('1h', 'payments', 50)
    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('service=payments')
    expect(url).toContain('limit=50')
  })
})

describe('fetchTraceDetail', () => {
  it('builds correct path', async () => {
    mockJson.mockResolvedValue({ trace_id: 'abc123', spans: [] })
    await fetchTraceDetail('abc123')
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/traces/abc123')
  })
})

describe('fetchLogs', () => {
  it('builds URL with all optional params', async () => {
    mockJson.mockResolvedValue({ logs: [], window: '1h', total: 0 })
    await fetchLogs('1h', 'api', 'ERROR', 'OOM', 50)
    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('window=1h')
    expect(url).toContain('service=api')
    expect(url).toContain('level=ERROR')
    expect(url).toContain('search=OOM')
    expect(url).toContain('limit=50')
  })

  it('omits optional params when not provided', async () => {
    mockJson.mockResolvedValue({ logs: [], window: '5m', total: 0 })
    await fetchLogs('5m')
    const url = mockFetch.mock.calls[0][0] as string
    expect(url).not.toContain('service=')
    expect(url).not.toContain('level=')
    expect(url).not.toContain('search=')
  })
})

describe('fetchTopology', () => {
  it('calls correct URL', async () => {
    mockJson.mockResolvedValue({ nodes: [], edges: [], window: '15m' })
    await fetchTopology('15m')
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/topology?window=15m')
  })
})

describe('fetchMetricNames', () => {
  it('builds URL without service', async () => {
    mockJson.mockResolvedValue({ metrics: [], window: '1h', service: '' })
    await fetchMetricNames('1h')
    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('/api/v1/metrics/names')
    expect(url).toContain('window=1h')
    expect(url).not.toContain('service=')
  })

  it('includes service param', async () => {
    mockJson.mockResolvedValue({ metrics: [], window: '1h', service: 'svc' })
    await fetchMetricNames('1h', 'svc')
    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('service=svc')
  })
})

describe('fetchMetricSeries', () => {
  it('builds URL with all required params', async () => {
    mockJson.mockResolvedValue({
      metric_name: 'jvm.gc.pause', metric_type: 'gauge',
      service: '', window: '1h', step: '1m', series: [],
    })
    await fetchMetricSeries('jvm.gc.pause', '1h', '1m')
    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('metric=jvm.gc.pause')
    expect(url).toContain('window=1h')
    expect(url).toContain('step=1m')
  })
})

describe('fetchAlertRules', () => {
  it('calls /api/v1/alerts/rules', async () => {
    mockJson.mockResolvedValue({ rules: [] })
    await fetchAlertRules()
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/alerts/rules')
  })
})

describe('fetchAlertStatus', () => {
  it('calls correct URL with window', async () => {
    mockJson.mockResolvedValue({ firing: [], evaluated_at: '' })
    await fetchAlertStatus('5m')
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/alerts/status?window=5m')
  })
})

describe('createAlertRule', () => {
  it('sends POST with JSON body', async () => {
    mockJson.mockResolvedValue({ id: '1', name: 'HighErr', service: '', metric: 'error_rate', condition: 'gt', threshold: 0.05, window: '5m', enabled: true, created_at: '' })
    await createAlertRule({ name: 'HighErr', service: '', metric: 'error_rate', condition: 'gt', threshold: 0.05, window: '5m' })
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/alerts/rules', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }))
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
    expect(body.metric).toBe('error_rate')
    expect(body.threshold).toBe(0.05)
  })
})

describe('deleteAlertRule', () => {
  it('sends DELETE to correct path', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: vi.fn() })
    await deleteAlertRule('rule-123')
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/alerts/rules/rule-123', expect.objectContaining({ method: 'DELETE' }))
  })
})

describe('API error handling', () => {
  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error' })
    await expect(fetchServices('5m')).rejects.toThrow('API error 500')
  })

  it('throws on 404', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' })
    await expect(fetchTraceDetail('nonexistent')).rejects.toThrow('API error 404')
  })
})
