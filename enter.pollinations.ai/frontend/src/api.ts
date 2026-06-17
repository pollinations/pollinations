import { hc } from "hono/client";
import type { ApiRoutes } from "./backend-types.ts";
import { config } from "./config.ts";

export const apiClient = hc<ApiRoutes>(config.apiBaseUrl, {
    init: { credentials: "include" },
});
export type ApiClient = typeof apiClient;
