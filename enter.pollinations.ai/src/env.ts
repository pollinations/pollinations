import type { RequestShape } from "@shared/observability/request-shape.ts";
import type { RequestIdVariables } from "hono/request-id";
import type { LoggerVariables } from "./middleware/logger.ts";

export type ErrorVariables = {
    error?: Error;
    requestShape?: RequestShape;
};

export type Env = {
    Bindings: CloudflareBindings;
    Variables: RequestIdVariables & LoggerVariables & ErrorVariables;
};
