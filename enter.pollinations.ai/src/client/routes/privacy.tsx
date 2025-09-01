import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
    component: RouteComponent,
});

function RouteComponent() {
    return <div>Hello "/privacy"!</div>;
}
