import { createFileRoute } from '@tanstack/react-router'
import { CardinalityPage } from '../components/CardinalityPage'

export const Route = createFileRoute('/cardinality')({
  component: CardinalityRoute,
})

function CardinalityRoute() {
  return <CardinalityPage />
}
