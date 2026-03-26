import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AppShell } from './components/layout/AppShell'
import { ServiceTable } from './components/ServiceTable'
import { ServiceDetail } from './components/ServiceDetail'
import { fetchServices } from './api/apm'
import type { TimeWindow } from './types/apm'

function App() {
  const [window, setWindow] = useState<TimeWindow>('5m')
  const [selectedService, setSelectedService] = useState<string | null>(null)

  // Fetch services at the App level so ServiceDetail can read the summary
  // without a second fetch. ServiceTable does its own query with the same key,
  // so react-query deduplicates the network request.
  const { data: servicesData } = useQuery({
    queryKey: ['services', window],
    queryFn: () => fetchServices(window),
    refetchInterval: 30_000,
    staleTime: 15_000,
  })

  const selectedSummary = servicesData?.services.find(
    (s) => s.name === selectedService,
  )

  const handleServiceSelect = (name: string) => {
    setSelectedService((prev) => (prev === name ? null : name))
  }

  const handleWindowChange = (w: TimeWindow) => {
    setWindow(w)
    // Keep selected service when changing window
  }

  return (
    <AppShell>
      <div className="flex flex-col h-full">
        {/* Page header */}
        <div
          className="px-6 py-4 border-b flex items-center justify-between flex-shrink-0"
          style={{ borderColor: 'var(--border)' }}
        >
          <div>
            <h1 className="text-base font-semibold" style={{ color: 'var(--text)' }}>
              Service Overview
            </h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
              RED metrics — Rate · Errors · Duration
            </p>
          </div>

          {/* Live indicator */}
          <div className="flex items-center gap-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: 'var(--success)',
                boxShadow: '0 0 4px var(--success)',
              }}
            />
            <span className="text-xs" style={{ color: 'var(--muted)' }}>
              live · 30s refresh
            </span>
          </div>
        </div>

        {/* Service table */}
        <div
          className="flex-shrink-0"
          style={{ borderBottom: selectedService ? '1px solid var(--border)' : 'none' }}
        >
          <ServiceTable
            window={window}
            onWindowChange={handleWindowChange}
            selectedService={selectedService}
            onServiceSelect={handleServiceSelect}
          />
        </div>

        {/* Service detail panel */}
        {selectedService && (
          <div className="flex-shrink-0">
            <ServiceDetail
              serviceName={selectedService}
              summary={selectedSummary}
              onClose={() => setSelectedService(null)}
            />
          </div>
        )}
      </div>
    </AppShell>
  )
}

export default App
