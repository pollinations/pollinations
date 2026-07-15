import type { ErrorVariables } from "@shared/error.ts";
import type { RequestIdVariables } from "hono/request-id";
import type { LoggerVariables } from "./middleware/logger.ts";

export type Env = {
    Bindings: CloudflareBindings & {
        APP_DEPLOY_HOST?: string;
        APP_DEPLOY_SERVICE?: string;
        APP_DEPLOY_ZONE_ID?: string;
        CF_WORKER_DEPLOY_API_TOKEN?: string;
    };
    Variables: RequestIdVariables & LoggerVariables & ErrorVariables;
};
