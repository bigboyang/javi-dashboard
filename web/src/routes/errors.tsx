import { createFileRoute } from '@tanstack/react-router'
import { ErrorGroupsPage } from '../components/ErrorGroupsPage'

export const Route = createFileRoute('/errors')({
  component: ErrorsPage,
})

function ErrorsPage() {
  return <ErrorGroupsPage />
}
