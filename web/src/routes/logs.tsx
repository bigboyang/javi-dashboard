import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { LogExplorer } from '../components/LogExplorer'
import { fetchServices } from '../api/apm'

export const Route = createFileRoute('/logs')({
  component: LogsPage,
})

function LogsPage() {
  const { data } = useQuery({
    queryKey: ['services', '5m'],
    queryFn: () => fetchServices('5m'),
    staleTime: 60_000,
  })
  return <LogExplorer services={data?.services.map((s) => s.name) ?? []} />
}
