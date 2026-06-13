import { createFileRoute } from '@tanstack/react-router'
import { InfraDashboard } from '../components/InfraDashboard'

export const Route = createFileRoute('/infra')({
  component: InfraPage,
})

function InfraPage() {
  return <InfraDashboard />
}
