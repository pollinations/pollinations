import type { ErrorVariables } from "@shared/error.ts";
import type { RequestIdVariables } from "hono/request-id";
import type { AuthVariables } from "@/middleware/auth.ts";
import type { BalanceVariables } from "@/middleware/balance.ts";
import type { GenerationCacheVariables } from "@/middleware/generation-cache.ts";
import type { LoggerVariables } from "@/middleware/logger.ts";
import type { FrontendKeyRateLimitVariables } from "@/middleware/rate-limit-durable.ts";
import type { SafetyVariables } from "@/middleware/safety.ts";
import type { ModelVariables } from "./middleware/model.ts";
import type { TrackVariables } from "./middleware/track.ts";
import type { TextVariables } from "./text/types.ts";
import type { X402Variables } from "./x402/payment.ts";

export type Env = {
    Bindings: CloudflareBindings;
    Variables: RequestIdVariables &
        LoggerVariables &
        ErrorVariables &
        AuthVariables &
        BalanceVariables &
        FrontendKeyRateLimitVariables &
        GenerationCacheVariables &
        SafetyVariables &
        TrackVariables &
        ModelVariables &
        TextVariables &
        X402Variables;
};
