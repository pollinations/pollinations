import type { AgentRunClaims } from "../auth/agent-run-token.ts";
import type { AuthenticatedApiKey, AuthUser } from "../auth/api-key.ts";
import type { EventType } from "./generation-event.ts";

/**
 * Wire contract between Enter's ServiceGateway RPC entrypoint and trusted
 * Pollinations services (reachable only through a named Cloudflare Service
 * Binding — never over public HTTP). Enter stays the canonical auth and
 * billing authority: a service holds the caller's raw credential only long
 * enough to authorize, then settles by authorization id.
 */

/** Why a credential or authorization was refused, in HTTP terms. */
export type ServiceDenial = {
    status: 401 | 402 | 403;
    message: string;
};

/**
 * Auth context for a generation/settlement decision: user id + tier, the
 * authenticated API key without its raw value, and agent run claims.
 */
export type TokenIntrospectionResult =
    | {
          valid: true;
          user: Pick<AuthUser, "id" | "tier">;
          apiKey: Omit<AuthenticatedApiKey, "rawKey">;
          agentRun?: AgentRunClaims;
      }
    | { valid: false; denial: ServiceDenial };

export type ServiceAuthorizeInput = {
    /** The caller's raw Pollinations credential (API key or agent run token). */
    token: string;
    /** Producing service, e.g. "media.pollinations.ai". Recorded on events. */
    service: string;
    /**
     * Service-generated id of the caller's request. Stable across retries; it
     * scopes settlement idempotency and links Tinybird rows to the request.
     */
    requestId: string;
    /** Request path recorded on the settled events. */
    requestPath: string;
    /**
     * Estimated pollen price of the work. Reserved from a finite API-key
     * budget atomically before the service does anything expensive.
     */
    estimatedPrice: number;
    /** Model to enforce API-key model permissions against, when relevant. */
    model?: string;
    /** The work is billable to paid balance only (never Quest Pollen). */
    paidOnly?: boolean;
};

export type ServiceAuthorization = {
    ok: true;
    authorizationId: string;
    user: Pick<AuthUser, "id" | "tier">;
    apiKey: Omit<AuthenticatedApiKey, "rawKey">;
    agentRun?: AgentRunClaims;
};

export type ServiceAuthorizeResult =
    | ServiceAuthorization
    | { ok: false; denial: ServiceDenial };

export type ServiceBillableEvent = {
    /**
     * Idempotency key, unique within the authorization. Retries and batched
     * re-deliveries with the same (authorizationId, eventId) settle once.
     */
    eventId: string;
    eventType: EventType;
    /** Actual pollen price of this event. Zero-price events are observability-only. */
    price: number;
    modelUsed?: string;
};

export type ServiceSettleInput = {
    authorizationId: string;
    events: ServiceBillableEvent[];
};

export type ServiceSettleResult =
    | {
          ok: true;
          /** Event ids settled by this call. */
          settled: string[];
          /** Event ids already settled by an earlier call (skipped). */
          duplicates: string[];
      }
    | { ok: false; error: "unknown_authorization" };

/**
 * Structural type of Enter's ServiceGateway RPC entrypoint, for services that
 * bind it (`[[services]] ... entrypoint = "ServiceGateway"`) without importing
 * Enter's code.
 */
export type ServiceGatewayBinding = {
    introspect(token: string): Promise<TokenIntrospectionResult>;
    authorize(input: ServiceAuthorizeInput): Promise<ServiceAuthorizeResult>;
    settle(input: ServiceSettleInput): Promise<ServiceSettleResult>;
};
