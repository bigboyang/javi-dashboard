import { createFileRoute } from '@tanstack/react-router'
import { ProfilingPage } from '../components/ProfilingPage'

export const Route = createFileRoute('/profiling')({
  component: ProfilingRoute,
})

function ProfilingRoute() {
  return <ProfilingPage />
}
