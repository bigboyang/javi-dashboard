import { createFileRoute } from '@tanstack/react-router'
import { CausalityExplorer } from '../components/CausalityExplorer'

export const Route = createFileRoute('/causality')({
  component: CausalityPage,
})

function CausalityPage() {
  return <CausalityExplorer />
}
