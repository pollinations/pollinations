import { WorkerEntrypoint } from "cloudflare:workers";
import type {
    ServiceAuthorizeInput,
    ServiceAuthorizeResult,
    ServiceCancelResult,
    ServiceSettleInput,
    ServiceSettleResult,
    TokenIntrospectionResult,
} from "@shared/schemas/service-billing.ts";
import {
    authorizeServiceRequest,
    cancelServiceRequest,
    introspectServiceToken,
    settleServiceEvents,
    sweepServiceGateway,
} from "./services/service-billing.ts";

/**
 * RPC entrypoint for trusted Pollinations services. Reachable only through a
 * named Cloudflare Service Binding (`entrypoint = "ServiceGateway"`) — it has
 * no fetch handler, so nothing here is publicly routable and `settle` never
 * becomes an arbitrary-charge endpoint: it can only debit what an earlier
 * `authorize` bound to a real credential.
 *
 * Trust boundary (v1): every worker holding this binding is a trusted
 * first-party Pollinations service. The binding itself is the credential —
 * there is no per-service identity, and a bound service is trusted to report
 * honest prices and event payloads for the requests it authorized. What a
 * service cannot do: bill without a live authorization created from a real
 * caller credential, bind another payer to a request id, charge more than a
 * finite key's reservation plus live budget, or rewrite the identity and
 * money fields of the analytics row.
 *
 * Each state-changing call also releases expired reservations in the
 * background. Enter runs no crons by design, so gateway traffic itself is
 * the sweep heartbeat.
 */
export class ServiceGateway extends WorkerEntrypoint<CloudflareBindings> {
    introspect(token: string): Promise<TokenIntrospectionResult> {
        return introspectServiceToken(this.env, token);
    }

    async authorize(
        input: ServiceAuthorizeInput,
    ): Promise<ServiceAuthorizeResult> {
        const result = await authorizeServiceRequest(this.env, input);
        this.ctx.waitUntil(sweepServiceGateway(this.env));
        return result;
    }

    async settle(input: ServiceSettleInput): Promise<ServiceSettleResult> {
        const result = await settleServiceEvents(this.env, input, (task) =>
            this.ctx.waitUntil(task),
        );
        this.ctx.waitUntil(sweepServiceGateway(this.env));
        return result;
    }

    async cancel(authorizationId: string): Promise<ServiceCancelResult> {
        const result = await cancelServiceRequest(this.env, authorizationId);
        this.ctx.waitUntil(sweepServiceGateway(this.env));
        return result;
    }
}
