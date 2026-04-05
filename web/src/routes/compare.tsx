import { createFileRoute } from '@tanstack/react-router'
import { MultiServiceComparison } from '../components/MultiServiceComparison'

export const Route = createFileRoute('/compare')({
  component: ComparePage,
})

function ComparePage() {
  return <MultiServiceComparison />
}
