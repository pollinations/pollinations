import type { AgentRunClaims } from "../auth/agent-run-token.ts";
import type { AuthenticatedApiKey, AuthUser } from "../auth/api-key.ts";
import type { EventType, TinybirdEvent } from "./generation-event.ts";

/**
 * Wire contract between Enter's ServiceGateway RPC entrypoint and trusted
 * Pollinations services (reachable only through a named Cloudflare Service
 * Binding — never over public HTTP). Enter stays the canonical auth and
 * billing authority: a service holds the caller's raw credential only long
 * enough to authorize, then settles by authorization id.
 */

/** Why a credential or authorization was refused, in HTTP terms. */
export type ServiceDenial = {
    /** 409: the request id was already authorized for a different request. */
    status: 401 | 402 | 403 | 409;
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

/**
 * Community model owner reward for one event: the owner is credited
 * `rewardRate` of the price (or of `basePrice` when the served listing is
 * cheaper than what the caller bought).
 */
export type ServiceCommunityReward = {
    ownerUserId: string;
    rewardRate: number;
    basePrice?: number;
};

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
    communityReward?: ServiceCommunityReward;
    /**
     * Extra Tinybird fields for this event (usage sheets, error details,
     * request identity extras). Merged into the delivered row; money fields
     * (totalPrice, markupRate, billed meter, isBilledUsage) always come from
     * the ledger and cannot be overridden.
     */
    telemetry?: Partial<TinybirdEvent>;
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
    | { ok: false; error: ServiceSettleError };

/**
 * Why nothing was settled: the authorization is unknown, was canceled or
 * expired before settlement (late settlements never charge), or an event id
 * was reused — within the call or against the ledger — with a different
 * financial payload. Identical repeats of an event id are one event.
 */
export type ServiceSettleError =
    | "unknown_authorization"
    | "authorization_canceled"
    | "authorization_expired"
    | "event_conflict";

export type ServiceCancelResult = {
    ok: true;
    /** Whether this call released an outstanding reservation. */
    released: boolean;
};

/**
 * Structural type of Enter's ServiceGateway RPC entrypoint, for services that
 * bind it (`[[services]] ... entrypoint = "ServiceGateway"`) without importing
 * Enter's code.
 */
export type ServiceGatewayBinding = {
    introspect(token: string): Promise<TokenIntrospectionResult>;
    authorize(input: ServiceAuthorizeInput): Promise<ServiceAuthorizeResult>;
    settle(input: ServiceSettleInput): Promise<ServiceSettleResult>;
    /**
     * Abandon an authorization whose work failed: releases any outstanding
     * reservation. Idempotent; a no-op once settled, canceled, or expired.
     */
    cancel(authorizationId: string): Promise<ServiceCancelResult>;
};
