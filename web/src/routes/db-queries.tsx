import { createFileRoute } from '@tanstack/react-router'
import { DbQueryPage } from '../components/DbQueryPage'

export const Route = createFileRoute('/db-queries')({
  component: DbQueriesRoute,
})

function DbQueriesRoute() {
  return <DbQueryPage />
}
