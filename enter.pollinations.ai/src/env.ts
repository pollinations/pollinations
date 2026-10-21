import type { ErrorVariables } from "@shared/error.ts";
import type { RequestIdVariables } from "hono/request-id";
import type { LoggerVariables } from "./middleware/logger.ts";

export type Env = {
    Bindings: CloudflareBindings & {
        WEFT_SELLER_API_KEY?: string;
        WEFT_FACILITATOR_URL?: string;
        WEFT_PAY_TO?: string;
        WEFT_NETWORK?: string;
        X402_HOLDING_USER_ID?: string;
        CODE_AGENT_DEPLOY_API_TOKEN?: string;
        CODE_AGENT_DISPATCH_NAMESPACE?: string;
        CODE_AGENT_CONTEXT?: {
            authorization: string;
            origin: string;
        };
    };
    Variables: RequestIdVariables & LoggerVariables & ErrorVariables;
};
