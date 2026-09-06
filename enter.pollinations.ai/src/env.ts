import type { ErrorVariables } from "@shared/error.ts";
import type { RequestIdVariables } from "hono/request-id";
import type { LoggerVariables } from "./middleware/logger.ts";

export type Env = {
    Bindings: CloudflareBindings & { TINYBIRD_ECONOMICS_READ_TOKEN?: string };
    Variables: RequestIdVariables & LoggerVariables & ErrorVariables;
};
