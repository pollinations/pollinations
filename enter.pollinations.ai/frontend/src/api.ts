import { hc } from "hono/client";
import type { ApiRoutes } from "./backend-types.ts";
import { config } from "./config.ts";
import { getActiveOrganizationId } from "./lib/active-organization.ts";

export const apiClient = hc<ApiRoutes>(config.apiBaseUrl, {
    init: { credentials: "include" },
    headers: (): Record<string, string> => {
        const organizationId = getActiveOrganizationId();
        const headers: Record<string, string> = {};
        if (organizationId) headers["X-Organization-Id"] = organizationId;
        return headers;
    },
});
export type ApiClient = typeof apiClient;
