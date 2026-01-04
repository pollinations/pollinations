import { hc } from "hono/client";
import type { ApiRoutes } from "../index.ts";

export const apiClient = hc<ApiRoutes>("/api");
export type ApiClient = typeof apiClient;
