import type { ServiceAuthorizeInput } from "@shared/schemas/service-billing.ts";
import { getRoutePath } from "@shared/util.ts";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { AuthVariables } from "@/middleware/auth.ts";
import type { BalanceVariables } from "@/middleware/balance.ts";
import type { ModelVariables } from "@/middleware/model.ts";

export const BILLING_SERVICE = "gen.pollinations.ai";

/** What a generation needs from the request to be authorized by Enter. */
export type GenerationAuthorizeInput = Omit<
    ServiceAuthorizeInput,
    "service" | "requestId"
>;

/**
 * The Enter authorization a generation runs under. Enter is the financial
 * authority: gen reports usage facts against this id at settlement and never
 * moves pollen itself. `settlement` resolves once the settle call has been
 * answered — true when Enter committed the request's events.
 */
export type GenerationBilling = {
    authorizationId: string;
    settlement?: Promise<boolean>;
};

export type BillingVariables = {
    billing?: GenerationBilling;
};

type BillingEnv = {
    Bindings: CloudflareBindings;
    Variables: AuthVariables &
        BalanceVariables &
        ModelVariables &
        BillingVariables & { requestId: string };
};

export function generationAuthorizeInput(
    vars: AuthVariables & BalanceVariables & ModelVariables,
    requestPath: string,
): GenerationAuthorizeInput {
    const token = vars.auth.apiKey?.rawKey;
    if (!token) {
        throw new HTTPException(401, {
            message: "A valid API key is required",
        });
    }
    return {
        token,
        requestPath,
        estimatedPrice: vars.balance.estimatedPrice ?? 0,
        model: vars.model.resolved,
        paidOnly: vars.model.definition.paidOnly,
    };
}

/**
 * Authorizes a generation that runs on the direct request path (streams
 * bypass the durable coordinator, which authorizes detached generations
 * itself). Runs after the cache lookup so a cache hit never reserves.
 */
export const authorizeGeneration = createMiddleware<BillingEnv>(
    async (c, next) => {
        const authorization = await c.env.ENTER_GATEWAY.authorize({
            ...generationAuthorizeInput(c.var, getRoutePath(c)),
            service: BILLING_SERVICE,
            requestId: c.get("requestId"),
        });
        if (!authorization.ok) {
            throw new HTTPException(authorization.denial.status, {
                message: authorization.denial.message,
            });
        }
        c.set("billing", { authorizationId: authorization.authorizationId });
        await next();
    },
);
