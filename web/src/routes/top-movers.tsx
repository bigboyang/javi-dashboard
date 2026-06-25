import { createFileRoute } from '@tanstack/react-router'
import { TopMoversPage } from '../components/TopMoversPage'

export const Route = createFileRoute('/top-movers')({
  component: TopMoversRoute,
})

function TopMoversRoute() {
  return <TopMoversPage />
}
