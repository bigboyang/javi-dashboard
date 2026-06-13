import { createFileRoute } from '@tanstack/react-router'
import { DeploymentEvents } from '../components/DeploymentEvents'

export const Route = createFileRoute('/deployments')({
  component: DeploymentsRoute,
})

function DeploymentsRoute() {
  return <DeploymentEvents />
}
