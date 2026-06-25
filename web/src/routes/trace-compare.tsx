import { createFileRoute } from '@tanstack/react-router'
import { TraceComparePage } from '../components/TraceComparePage'

export const Route = createFileRoute('/trace-compare')({
  component: TraceCompareRoute,
})

function TraceCompareRoute() {
  return <TraceComparePage />
}
