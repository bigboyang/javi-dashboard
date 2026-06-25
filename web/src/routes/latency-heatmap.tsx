import { createFileRoute } from '@tanstack/react-router'
import { LatencyHeatmapPage } from '../components/LatencyHeatmapPage'

export const Route = createFileRoute('/latency-heatmap')({
  component: LatencyHeatmapRoute,
})

function LatencyHeatmapRoute() {
  return <LatencyHeatmapPage />
}
