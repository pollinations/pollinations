import type { ErrorVariables } from "@shared/error.ts";
import type { LoggerVariables } from "@shared/middleware/logger.ts";
import type { RequestIdVariables } from "hono/request-id";

export type Env = {
    Bindings: CloudflareBindings;
    Variables: RequestIdVariables & LoggerVariables & ErrorVariables;
};
