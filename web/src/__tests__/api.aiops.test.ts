import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchAnomalies, fetchRCA } from '../api/aiops'
import { fetchRAGSearch } from '../api/search'

const mockJson = vi.fn()
const mockFetch = vi.fn()

beforeEach(() => {
  mockJson.mockReset()
  mockFetch.mockReset()
  mockFetch.mockResolvedValue({ ok: true, json: mockJson })
  vi.stubGlobal('fetch', mockFetch)
})

describe('fetchAnomalies', () => {
  it('defaults to window=1h', async () => {
    mockJson.mockResolvedValue({ anomalies: [] })
    await fetchAnomalies()
    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('window=1h')
  })

  it('includes service and severity when provided', async () => {
    mockJson.mockResolvedValue({ anomalies: [] })
    await fetchAnomalies('6h', 'payments', 'critical')
    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('window=6h')
    expect(url).toContain('service=payments')
    expect(url).toContain('severity=critical')
  })

  it('omits optional params when not given', async () => {
    mockJson.mockResolvedValue({ anomalies: [] })
    await fetchAnomalies('1h')
    const url = mockFetch.mock.calls[0][0] as string
    expect(url).not.toContain('service=')
    expect(url).not.toContain('severity=')
  })
})

describe('fetchRCA', () => {
  it('defaults to window=1h', async () => {
    mockJson.mockResolvedValue({ reports: [] })
    await fetchRCA()
    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('/api/v1/aiops/rca')
    expect(url).toContain('window=1h')
  })

  it('includes service when provided', async () => {
    mockJson.mockResolvedValue({ reports: [] })
    await fetchRCA('24h', 'inventory')
    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('service=inventory')
  })
})

describe('fetchRAGSearch', () => {
  it('sends POST with correct JSON body', async () => {
    mockJson.mockResolvedValue({ results: [] })
    await fetchRAGSearch('NullPointerException', 'api', 1000, 5)
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/rag/search', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }))
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
    expect(body.query).toBe('NullPointerException')
    expect(body.service).toBe('api')
    expect(body.from_ms).toBe(1000)
    expect(body.limit).toBe(5)
  })

  it('defaults service to empty string and from_ms to 0', async () => {
    mockJson.mockResolvedValue({ results: [] })
    await fetchRAGSearch('OutOfMemoryError')
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
    expect(body.service).toBe('')
    expect(body.from_ms).toBe(0)
    expect(body.limit).toBe(10)
  })

  it('throws with error message from response body on failure', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      statusText: 'Bad Request',
      json: vi.fn().mockResolvedValue({ error: 'query too short' }),
    })
    await expect(fetchRAGSearch('x')).rejects.toThrow('query too short')
  })
})
