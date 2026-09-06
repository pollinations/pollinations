import { createAuthClient } from "better-auth/react";

// The cookie remains host-only on Enter. Dashboards never receive an API key
// or create their own session.
export function createDashboardClient(
    baseURL = "https://enter.pollinations.ai",
) {
    const auth = createAuthClient({ baseURL, basePath: "/api/auth" });
    return {
        auth,
        fetch(path: string) {
            return fetch(new URL(`/api/dashboards${path}`, baseURL), {
                credentials: "include",
            });
        },
    };
}
