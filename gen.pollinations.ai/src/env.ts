import type { RequestIdVariables } from "hono/request-id";
import type { AuthVariables } from "@/middleware/auth.ts";
import type { BalanceVariables } from "@/middleware/balance.ts";
import type { LoggerVariables } from "@/middleware/logger.ts";
import type { FrontendKeyRateLimitVariables } from "@/middleware/rate-limit-durable.ts";
import type { SafetyVariables } from "@/middleware/safety.ts";
import type { ModelVariables } from "./middleware/model.ts";
import type { TrackVariables } from "./middleware/track.ts";

export type ErrorVariables = {
    error?: Error;
};

export type Env = {
    Bindings: CloudflareBindings;
    Variables: RequestIdVariables &
        LoggerVariables &
        ErrorVariables &
        AuthVariables &
        BalanceVariables &
        FrontendKeyRateLimitVariables &
        SafetyVariables &
        TrackVariables &
        ModelVariables;
};
