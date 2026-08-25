import { env } from "cloudflare:test";
import type { ServiceGatewayBinding } from "@shared/schemas/service-billing.ts";
import {
    authorizeServiceRequest,
    cancelServiceRequest,
    introspectServiceToken,
    settleServiceEvents,
} from "../../enter.pollinations.ai/src/services/service-billing.ts";

/**
 * The real Enter gateway, run in-process against the test D1 database. Gen
 * and Enter share one database in every environment, so binding Enter's
 * actual introspect/authorize/settle functions here exercises the exact
 * production code path minus the RPC hop — no stubs: tests assert against
 * the ledger rows and balances the real functions write.
 */

type GatewayEnv = Parameters<typeof authorizeServiceRequest>[0];

export const gatewayEnv = env as unknown as GatewayEnv;

/** Enter's gateway over the test environment with the given overrides. */
export function enterGatewayFor(
    overrides: Partial<GatewayEnv>,
): ServiceGatewayBinding {
    const gateway = { ...gatewayEnv, ...overrides } as GatewayEnv;
    return {
        introspect: (token) => introspectServiceToken(gateway, token),
        authorize: (input) => authorizeServiceRequest(gateway, input),
        settle: (input) => settleServiceEvents(gateway, input),
        cancel: (authorizationId) =>
            cancelServiceRequest(gateway, authorizationId),
    };
}

export const enterGateway = enterGatewayFor({});

/**
 * A Durable Object instance receives its own copy of the worker env, so the
 * gateway installed on the test env (test/setup/apply-migrations.ts) has to
 * be installed on the instance under test as well.
 */
export function bindEnterGateway(instance: unknown): void {
    Object.assign((instance as { env: Record<string, unknown> }).env, {
        ENTER_GATEWAY: enterGateway,
    });
}
