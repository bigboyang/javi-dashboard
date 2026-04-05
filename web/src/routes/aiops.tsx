import { createFileRoute } from '@tanstack/react-router'
import { AIOpsCenter } from '../components/AIOpsCenter'

export const Route = createFileRoute('/aiops')({
  component: AIOpsPage,
})

function AIOpsPage() {
  return <AIOpsCenter />
}
