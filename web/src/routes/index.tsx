import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ServiceTable } from '../components/ServiceTable'
import { ServiceDetail } from '../components/ServiceDetail'
import { fetchServices } from '../api/apm'
import type { TimeWindow } from '../types/apm'

export const Route = createFileRoute('/')({
  component: OverviewPage,
})

function OverviewPage() {
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('5m')
  const [selectedService, setSelectedService] = useState<string | null>(null)

  const { data: servicesData } = useQuery({
    queryKey: ['services', timeWindow],
    queryFn: () => fetchServices(timeWindow),
    refetchInterval: 30_000,
    staleTime: 15_000,
  })

  const selectedSummary = servicesData?.services.find((s) => s.name === selectedService)

  return (
    <div className="flex flex-col h-full">
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
        <div className="flex items-center gap-1.5">
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: 'var(--success)', boxShadow: '0 0 4px var(--success)' }}
          />
          <span className="text-xs" style={{ color: 'var(--muted)' }}>
            live · 30s refresh
          </span>
        </div>
      </div>

      <div
        className="flex-shrink-0"
        style={{ borderBottom: selectedService ? '1px solid var(--border)' : 'none' }}
      >
        <ServiceTable
          window={timeWindow}
          onWindowChange={setTimeWindow}
          selectedService={selectedService}
          onServiceSelect={(name) => setSelectedService((prev) => (prev === name ? null : name))}
        />
      </div>

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
  )
}
