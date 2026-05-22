// Type-only boundary to the Worker backend. Keep backend source imports here so
// frontend/backend coupling is explicit and easy to replace later with bundled
// generated declarations. Naive tsc declaration emit is not enough today
// because route types include hono-openapi declarations.
export type { FrontendApiRoutes as ApiRoutes } from "../../src/frontend-api.ts";
