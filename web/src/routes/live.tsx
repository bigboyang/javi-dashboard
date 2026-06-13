import { createFileRoute } from '@tanstack/react-router'
import { LiveStream } from '../components/LiveStream'

export const Route = createFileRoute('/live')({
  component: LiveRoute,
})

function LiveRoute() {
  return <LiveStream />
}
