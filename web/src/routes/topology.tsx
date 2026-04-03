import { createFileRoute } from '@tanstack/react-router'
import { TopologyExplorer } from '../components/TopologyExplorer'

export const Route = createFileRoute('/topology')({
  component: () => <TopologyExplorer />,
})
