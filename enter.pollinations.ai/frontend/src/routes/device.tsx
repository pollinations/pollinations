import { createFileRoute } from "@tanstack/react-router";
import { Device } from "../components/auth/device.tsx";

export const Route = createFileRoute("/device")({
    component: RouteComponent,
    validateSearch: (search: Record<string, unknown>) => ({
        user_code: typeof search.user_code === "string" ? search.user_code : "",
    }),
});

function RouteComponent() {
    const { user_code } = Route.useSearch();
    return <Device prefilledCode={user_code} />;
}
