import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { TraceExplorer } from '../components/TraceExplorer'
import { fetchServices } from '../api/apm'

export const Route = createFileRoute('/traces')({
  component: TracesPage,
})

function TracesPage() {
  const { data } = useQuery({
    queryKey: ['services', '5m'],
    queryFn: () => fetchServices('5m'),
    staleTime: 60_000,
  })
  return <TraceExplorer services={data?.services.map((s) => s.name) ?? []} />
}
