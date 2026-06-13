import { createFileRoute } from '@tanstack/react-router'
import { HistogramDashboard } from '../components/HistogramDashboard'

export const Route = createFileRoute('/histogram')({
  component: HistogramRoute,
})

function HistogramRoute() {
  return <HistogramDashboard />
}
