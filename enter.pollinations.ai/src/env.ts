import type { ErrorVariables } from "@shared/error.ts";
import type { RequestIdVariables } from "hono/request-id";
import type { LoggerVariables } from "./middleware/logger.ts";

export type Env = {
    Bindings: CloudflareBindings & {
        CODE_AGENT_DEPLOY_API_TOKEN?: string;
        CODE_AGENT_DISPATCH_NAMESPACE?: string;
        CODE_AGENT_CONTEXT?: {
            authorization: string;
            origin: string;
        };
    };
    Variables: RequestIdVariables & LoggerVariables & ErrorVariables;
};
