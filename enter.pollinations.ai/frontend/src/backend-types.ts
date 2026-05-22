// Type-only boundary to the Worker backend. Keep backend source imports here so
// frontend/backend coupling is explicit and easy to replace with generated
// declarations when the static frontend becomes fully standalone.
export type { ApiRoutes } from "../../src/api.ts";
