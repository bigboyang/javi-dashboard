import { createFileRoute } from '@tanstack/react-router'
import { CustomDashboard } from '../components/CustomDashboard'

export const Route = createFileRoute('/dashboard')({
  component: DashboardPage,
})

function DashboardPage() {
  return <CustomDashboard />
}
