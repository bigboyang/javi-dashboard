import { createFileRoute } from '@tanstack/react-router'
import { SloDashboard } from '../components/SloDashboard'

export const Route = createFileRoute('/slo')({
  component: SloRoute,
})

function SloRoute() {
  return <SloDashboard />
}
