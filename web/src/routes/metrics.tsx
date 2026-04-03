import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { MetricsExplorer } from '../components/MetricsExplorer'
import { fetchServices } from '../api/apm'

export const Route = createFileRoute('/metrics')({
  component: MetricsPage,
})

function MetricsPage() {
  const { data } = useQuery({
    queryKey: ['services', '5m'],
    queryFn: () => fetchServices('5m'),
    staleTime: 60_000,
  })
  return <MetricsExplorer services={data?.services.map((s) => s.name) ?? []} />
}
