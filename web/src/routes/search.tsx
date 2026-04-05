import { createFileRoute } from '@tanstack/react-router'
import { RAGSearchPage } from '../components/RAGSearchPage'

export const Route = createFileRoute('/search')({
  component: SearchPage,
})

function SearchPage() {
  return <RAGSearchPage />
}
