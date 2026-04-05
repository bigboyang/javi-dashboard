import { createFileRoute } from '@tanstack/react-router'
import { ServiceDetailPage } from '../components/ServiceDetailPage'

export const Route = createFileRoute('/services/$name')({
  component: ServiceDetailRoute,
})

function ServiceDetailRoute() {
  const { name } = Route.useParams()
  return <ServiceDetailPage serviceName={name} />
}
