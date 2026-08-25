import { env } from "cloudflare:test";
import type { ServiceGatewayBinding } from "@shared/schemas/service-billing.ts";
import {
    authorizeServiceRequest,
    cancelServiceRequest,
    introspectServiceToken,
    settleServiceEvents,
} from "../../enter.pollinations.ai/src/services/service-billing.ts";

/**
 * The real Enter gateway, run in-process against the test D1 database. Media
 * and Enter share one database in every environment, so binding Enter's
 * actual authorize/settle functions here exercises the exact production code
 * path minus the RPC hop — no stubs, no recorded calls: tests assert against
 * the ledger rows and balances the real functions write.
 */

type GatewayEnv = Parameters<typeof authorizeServiceRequest>[0];

export const gatewayEnv = env as unknown as GatewayEnv;

export const enterGateway: ServiceGatewayBinding = {
    introspect: (token) => introspectServiceToken(gatewayEnv, token),
    authorize: (input) => authorizeServiceRequest(gatewayEnv, input),
    settle: (input) => settleServiceEvents(gatewayEnv, input),
    cancel: (authorizationId) =>
        cancelServiceRequest(gatewayEnv, authorizationId),
};
