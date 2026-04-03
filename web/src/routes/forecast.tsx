import { createFileRoute } from '@tanstack/react-router'
import { ForecastDashboard } from '../components/ForecastDashboard'

export const Route = createFileRoute('/forecast')({
  component: ForecastPage,
})

function ForecastPage() {
  return <ForecastDashboard />
}
