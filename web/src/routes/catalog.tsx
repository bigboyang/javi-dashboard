import { createFileRoute } from '@tanstack/react-router'
import { ServiceCatalog } from '../components/ServiceCatalog'

export const Route = createFileRoute('/catalog')({
  component: CatalogRoute,
})

function CatalogRoute() {
  return <ServiceCatalog />
}
