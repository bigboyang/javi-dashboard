import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { AlertExplorer } from '../components/AlertExplorer'
import { fetchServices } from '../api/apm'

export const Route = createFileRoute('/alerts')({
  component: AlertsPage,
})

function AlertsPage() {
  const { data } = useQuery({
    queryKey: ['services', '5m'],
    queryFn: () => fetchServices('5m'),
    staleTime: 60_000,
  })
  return <AlertExplorer services={data?.services.map((s) => s.name) ?? []} />
}
