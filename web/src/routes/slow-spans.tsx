import { createFileRoute } from '@tanstack/react-router'
import { SlowSpansPage } from '../components/SlowSpansPage'

export const Route = createFileRoute('/slow-spans')({
  component: SlowSpansRoute,
})

function SlowSpansRoute() {
  return <SlowSpansPage />
}
