import {
    type CommunityEndpointRuntime,
    isCommunityFallbackBalanceAllowed,
    isCommunityFallbackPricingAllowed,
    MAX_FALLBACK_TARGETS,
    usesAgentRunToken,
} from "@shared/community-endpoints.ts";
import type { ModelDefinition } from "@shared/registry/registry.ts";
import { FALLBACK_TARGET_HEADER } from "@shared/registry/usage-headers.ts";
import {
    firstContentPolicyMessage,
    providerErrorText,
} from "./image/utils/contentModeration.ts";
import type { GenerationModelEntry } from "./model-registry.ts";

/** Formats the served target marker in Portkey's header shape. */
export function formatFallbackTarget(index: number): string {
    return `config.targets[${index}]`;
}

/**
 * Internal-only marker: which declared target served. Must stay
 * non-enumerable so JSON bodies and R2 cache snapshots never leak it.
 */
export function attachFallbackTarget<T extends object>(
    value: T,
    index: number,
): T {
    if (index <= 0) return value;
    Object.defineProperty(value, "fallbackTarget", {
        value: formatFallbackTarget(index),
        enumerable: false,
        configurable: true,
        writable: true,
    });
    return value;
}

/**
 * Non-5xx upstream statuses that make a request move on to the model's next
 * fallback target. Every upstream 5xx retries without needing to be listed.
 *
 * 400 and 422 are left out on purpose: those are caller errors and retrying
 * them elsewhere cannot succeed. 401/402/403/404 are included because they mean
 * the primary's credentials or upstream model are broken, which the fallback may
 * survive.
 */
export const FALLBACK_ON_STATUS_CODES = [401, 402, 403, 404, 408, 429];

/**
 * Network-level failures — unreachable host, expired cert, refused connection —
 * arrive as a TypeError with no status, and are the most likely hard failure for
 * a self-hosted endpoint. They must fail over, but the match is on the message
 * so that our own TypeErrors (a null dereference in a handler) are not mistaken
 * for one and silently blamed on the upstream.
 */
export function isNetworkFailure(error: unknown): boolean {
    return (
        error instanceof TypeError &&
        /fetch failed|network|connection|socket/i.test(error.message)
    );
}

/**
 * Generation clients preserve the original provider status in `upstreamStatus`
 * when mapping gateway failures (e.g. 429 → 502). Prefer that original status
 * for retries. A successful
 * upstream status is the exception: if its body is malformed, the client wraps
 * that provider failure in a retryable status such as 502.
 */
type UpstreamFailure = {
    status?: unknown;
    upstreamStatus?: unknown;
    details?: unknown;
    message?: string;
    responseBody?: unknown;
};

/**
 * A gateway that could not route to the endpoint at all, as opposed to an
 * upstream that answered.
 *
 * Portkey rejects an endpoint whose host is unreachable, unresolvable or
 * malformed with a 400 carrying its own envelope:
 *
 *     {"status":"failure","message":"Invalid custom host"}
 *
 * A provider's own 400 is proxied through instead and arrives under an `error`
 * key. So the envelope, not the status, is what separates "this endpoint is
 * dead" from "the caller sent a bad request" — and only the former is worth
 * trying the next candidate for. Without this, a community endpoint whose
 * domain lapses never fails over, because the gateway reports it as a 400 and
 * 400 is deliberately excluded above.
 */
function isGatewayRoutingFailure(failure: UpstreamFailure): boolean {
    // The text client attaches the parsed body as `details`, the image client
    // keeps the raw string as `responseBody`. Either can carry the envelope.
    for (const candidate of [failure.details, failure.responseBody]) {
        let body: unknown = candidate;
        if (typeof body === "string") {
            try {
                body = JSON.parse(body);
            } catch {
                // A body we cannot parse is not a shape we can claim to know.
                continue;
            }
        }
        if (
            body &&
            typeof body === "object" &&
            !("error" in body) &&
            (body as { status?: unknown }).status === "failure"
        ) {
            return true;
        }
    }
    return false;
}

function upstreamStatus(failure: UpstreamFailure): number | undefined {
    const upstream = failure.upstreamStatus;
    if (typeof upstream === "number" && (upstream < 200 || upstream >= 300)) {
        return upstream;
    }
    return typeof failure.status === "number"
        ? failure.status
        : typeof upstream === "number"
          ? upstream
          : undefined;
}

/** The deadline we send to Portkey is the request's terminal time budget. */
function isPortkeyRequestTimeout(failure: UpstreamFailure): boolean {
    if (upstreamStatus(failure) !== 408) return false;
    const details = failure.details;
    if (!details || typeof details !== "object") return false;
    const error = (details as { error?: unknown }).error;
    if (!error || typeof error !== "object") return false;
    const timeoutError = error as { message?: unknown; type?: unknown };
    return (
        timeoutError.type === "timeout_error" &&
        typeof timeoutError.message === "string" &&
        timeoutError.message.startsWith(
            "Request exceeded the timeout sent in the request:",
        )
    );
}

/**
 * Read provider error fields consistently with the image boundary, without
 * mistaking echoed request inputs for a content-policy rejection.
 */
function upstreamFailureText(failure: UpstreamFailure): (string | undefined)[] {
    const { details } = failure;
    let detailsText: string | null = null;
    if (typeof details === "string") {
        detailsText = details;
    } else if (details) {
        try {
            detailsText = JSON.stringify(details);
        } catch {
            // A details bag we cannot serialize still leaves error.message.
        }
    }
    return [
        providerErrorText(detailsText),
        providerErrorText(
            typeof failure.responseBody === "string"
                ? failure.responseBody
                : undefined,
        ),
        providerErrorText(failure.message),
    ];
}

/**
 * Only a broken upstream is worth another attempt.
 *
 * Content-policy refusals are excluded at any status — routing a moderation
 * rejection to a possibly more permissive endpoint would turn an unbilled 422
 * into a billed generation and bypass the primary's moderation.
 *
 * An error with no upstream status is never retried, which is what keeps our own
 * bugs from being blamed on a fallback: a handler's TypeError, a misconfigured
 * delegating endpoint, a failed secret decryption all reach here as a plain
 * Error and are rethrown untouched.
 */
export function isRetryableFallbackError(error: unknown): boolean {
    if (isNetworkFailure(error)) return true;
    if (!(error instanceof Error)) return false;
    const failure = error as UpstreamFailure;
    const status = upstreamStatus(failure);
    if (!status) return false;
    // A generic provider 408 can benefit from a fallback. Portkey's exact
    // timeout envelope is our own total deadline and must not multiply across
    // fallback candidates.
    if (isPortkeyRequestTimeout(failure)) return false;
    // A dead endpoint reaches us as the gateway's own 400 rather than as a
    // network error, because the gateway is the one that could not connect.
    const gatewayRoutingFailure = isGatewayRoutingFailure(failure);
    const serverError = status >= 500 && status <= 599;
    if (
        !serverError &&
        !FALLBACK_ON_STATUS_CODES.includes(status) &&
        !gatewayRoutingFailure
    ) {
        return false;
    }
    return !firstContentPolicyMessage(upstreamFailureText(failure));
}

/**
 * One model to generate with. The minimal shape every modality needs, so the
 * seam below does not depend on how any one handler reaches its provider.
 */
export type FallbackCandidate = {
    id: string;
    /** Always present alongside `communityEndpoint`: it is what prices it. */
    definition?: ModelDefinition;
    communityEndpoint?: CommunityEndpointRuntime;
    /** Serving registry entry. Absent on the model the caller asked for. */
    entry?: GenerationModelEntry;
};

type PrimaryModel = {
    resolved: string;
    definition: ModelDefinition;
    communityEndpoint?: CommunityEndpointRuntime;
    fallbackEntries?: GenerationModelEntry[];
};

/**
 * The model the caller asked for, then each declared fallback in order.
 *
 * An absent model means generation was reached without the model middleware, so
 * there is no registry entry and nothing to fall back to — the one attempt still
 * runs against whatever the provider config resolves.
 */
export function fallbackCandidates(
    model: PrimaryModel | undefined,
): FallbackCandidate[] {
    const candidates: FallbackCandidate[] = [
        {
            id: model?.resolved ?? "",
            definition: model?.definition,
            communityEndpoint: model?.communityEndpoint,
        },
    ];
    for (const entry of model?.fallbackEntries ?? []) {
        candidates.push({
            id: entry.id,
            definition: entry.definition,
            communityEndpoint: entry.communityEndpoint,
            entry,
        });
    }
    return candidates;
}

function isUsableCommunityFallback(
    from: GenerationModelEntry,
    target: GenerationModelEntry,
): target is GenerationModelEntry {
    if (target.eventType !== from.eventType) return false;
    const primary = from.communityEndpoint;
    const candidate = target.communityEndpoint;
    if (!primary || !candidate) return false;
    if (primary.modality !== candidate.modality) return false;
    if (usesAgentRunToken(candidate)) return false;
    if (primary.imagePricing !== candidate.imagePricing) return false;
    if (!isCommunityFallbackBalanceAllowed(primary, candidate)) return false;
    if (
        !from.supportedEndpoints.every((endpoint) =>
            target.supportedEndpoints.includes(endpoint),
        )
    ) {
        return false;
    }
    return isCommunityFallbackPricingAllowed(primary, candidate);
}

/** Resolves every model's declared ids once, before the request hot path. */
export function linkFallbackEntries(
    entries: GenerationModelEntry[],
    byIdOrAlias: Map<string, GenerationModelEntry>,
): void {
    for (const entry of entries) {
        const configured = entry.definition.fallbacks ?? [];
        const declared = entry.communityEndpoint
            ? configured.slice(0, MAX_FALLBACK_TARGETS)
            : configured;
        const targets: GenerationModelEntry[] = [];

        for (const targetId of declared) {
            const target = byIdOrAlias.get(targetId);
            if (!target || target === entry) continue;
            if (entry.communityEndpoint) {
                const targetEndpoint = target.communityEndpoint;
                if (targetEndpoint?.hiddenAt != null) continue;
                if (
                    targetEndpoint?.visibility === "private" &&
                    entry.communityEndpoint.ownerUserId !==
                        targetEndpoint.ownerUserId
                ) {
                    continue;
                }
                if (!isUsableCommunityFallback(entry, target)) continue;
            }
            if (targets.some((linked) => linked.id === target.id)) continue;
            targets.push({ ...target, fallbackEntries: undefined });
        }

        entry.fallbackEntries = targets.length > 0 ? targets : undefined;
    }
}

/** One upstream call in the fallback loop, in order. */
export type FallbackAttempt = {
    candidate: FallbackCandidate;
    startedAt: Date;
    endedAt: Date;
    error?: unknown;
    /** True when this call served or ended the request. */
    settled: boolean;
};

/**
 * Runs `attempt` against each candidate until one succeeds.
 *
 * Placed around the upstream call itself rather than around the request, so
 * authentication, balance and moderation run exactly once no matter how many
 * models are tried. A local per-candidate guard may run immediately before an
 * attempt. Every candidate is tried at most once: the dominant failure is an
 * exhausted quota, and asking the same endpoint again would only spend more of
 * a budget that is already gone.
 *
 * Every upstream call is appended to `attempts`, including the one that serves
 * or ends the request. Recording is not the same as retrying: this loop decides
 * only which candidate to try next, and leaves what any of it means to whoever
 * reads the ordered trace.
 *
 * Safe for streaming: the clients throw before returning a body, so a failed
 * attempt has sent the caller nothing.
 */
export async function withModelFallback<
    T,
    Candidate extends FallbackCandidate = FallbackCandidate,
>(
    candidates: Candidate[],
    attempt: (candidate: Candidate) => Promise<T>,
    attempts?: FallbackAttempt[],
    beforeAttempt?: (candidate: Candidate) => Promise<void>,
    shouldFallback: (
        error: unknown,
        candidate: Candidate,
    ) => boolean = isRetryableFallbackError,
): Promise<{ result: T; candidate: Candidate; index: number }> {
    for (const [index, candidate] of candidates.entries()) {
        // Local gates are not upstream failures and must not trigger or be
        // attributed to another fallback candidate.
        await beforeAttempt?.(candidate);
        // Timed from this attempt's own start. Measured from the request's, a
        // second attempt would report the first one's timeout as part of its
        // own latency.
        const startedAt = new Date();
        try {
            const result = await attempt(candidate);
            attempts?.push({
                candidate,
                startedAt,
                endedAt: new Date(),
                settled: true,
            });
            return { result, candidate, index };
        } catch (error) {
            const terminal =
                index === candidates.length - 1 ||
                !shouldFallback(error, candidate);
            attempts?.push({
                candidate,
                error,
                startedAt,
                endedAt: new Date(),
                settled: terminal,
            });
            if (terminal) throw error;
        }
    }
    // Unreachable: the loop either returns or rethrows for a non-empty list, and
    // the primary is always the first candidate.
    throw new Error("Model fallback needs at least one candidate");
}

/** Runs a response-producing handler and marks which model actually served. */
export async function withModelFallbackResponse(
    model: PrimaryModel,
    attempt: (candidate: FallbackCandidate) => Promise<Response>,
    attempts?: FallbackAttempt[],
    beforeAttempt?: (candidate: FallbackCandidate) => Promise<void>,
): Promise<Response> {
    const { result, index } = await withModelFallback(
        fallbackCandidates(model),
        attempt,
        attempts,
        beforeAttempt,
    );
    if (index > 0) {
        result.headers.set(FALLBACK_TARGET_HEADER, formatFallbackTarget(index));
    }
    return result;
}
