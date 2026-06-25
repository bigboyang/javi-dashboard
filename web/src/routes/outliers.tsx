import { createFileRoute } from '@tanstack/react-router'
import { OutliersPage } from '../components/OutliersPage'

export const Route = createFileRoute('/outliers')({
  component: OutliersRoute,
})

function OutliersRoute() {
  return <OutliersPage />
}
