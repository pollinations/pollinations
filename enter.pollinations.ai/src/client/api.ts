import type { ApiRoutes } from "../index.ts";
import { hc } from "hono/client";

export const apiClient = hc<ApiRoutes>("/api");
export type ApiClient = typeof apiClient;
