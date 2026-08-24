import { WorkerEntrypoint } from "cloudflare:workers";
import type {
    ServiceAuthorizeInput,
    ServiceAuthorizeResult,
    ServiceSettleInput,
    ServiceSettleResult,
    TokenIntrospectionResult,
} from "@shared/schemas/service-billing.ts";
import {
    authorizeServiceRequest,
    introspectServiceToken,
    settleServiceEvents,
} from "./services/service-billing.ts";

/**
 * RPC entrypoint for trusted Pollinations services. Reachable only through a
 * named Cloudflare Service Binding (`entrypoint = "ServiceGateway"`) — it has
 * no fetch handler, so nothing here is publicly routable and `settle` never
 * becomes an arbitrary-charge endpoint: it can only debit what an earlier
 * `authorize` bound to a real credential.
 */
export class ServiceGateway extends WorkerEntrypoint<CloudflareBindings> {
    introspect(token: string): Promise<TokenIntrospectionResult> {
        return introspectServiceToken(this.env, token);
    }

    authorize(input: ServiceAuthorizeInput): Promise<ServiceAuthorizeResult> {
        return authorizeServiceRequest(this.env, input);
    }

    settle(input: ServiceSettleInput): Promise<ServiceSettleResult> {
        return settleServiceEvents(this.env, input);
    }
}
