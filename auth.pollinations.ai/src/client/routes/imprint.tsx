import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/imprint')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/imprint"!</div>
}
