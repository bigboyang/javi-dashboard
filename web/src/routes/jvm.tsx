import { createFileRoute } from '@tanstack/react-router'
import { JVMDashboard } from '../components/JVMDashboard'

export const Route = createFileRoute('/jvm')({
  component: JVMPage,
})

function JVMPage() {
  return <JVMDashboard />
}
