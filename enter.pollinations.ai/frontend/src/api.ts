import { hc } from "hono/client";
import type { ApiRoutes } from "./backend-types.ts";

export const apiClient = hc<ApiRoutes>("/api");
export type ApiClient = typeof apiClient;
