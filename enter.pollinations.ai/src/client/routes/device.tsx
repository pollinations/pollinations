import { createFileRoute } from "@tanstack/react-router";
import { Device } from "../components/auth/device.tsx";

export const Route = createFileRoute("/device")({
    component: RouteComponent,
    validateSearch: (search: Record<string, unknown>) => ({
        user_code: (search.user_code as string) || "",
    }),
});

function RouteComponent() {
    const { user_code } = Route.useSearch();
    return <Device prefilledCode={user_code} />;
}
