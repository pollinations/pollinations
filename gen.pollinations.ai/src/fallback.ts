import type { CommunityEndpointRuntime } from "@shared/community-endpoints.ts";
import type { ModelDefinition } from "@shared/registry/registry.ts";
import { firstContentPolicyMessage } from "./image/utils/contentModeration.ts";
import type { GenerationModelEntry } from "./model-registry.ts";

/**
 * Upstream statuses that make a request move on to the model's next fallback
 * target.
 *
 * 400 and 422 are left out on purpose: those are caller errors and retrying
 * them elsewhere cannot succeed. 401/402/403/404 are included because they mean
 * the primary's credentials or upstream model are broken, which the fallback may
 * survive.
 */
export const FALLBACK_ON_STATUS_CODES = [
    401, 402, 403, 404, 408, 429, 500, 502, 503, 504,
];

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
 * The upstream failure shapes the generation clients throw. The image client
 * throws the provider's status as-is; the text client remaps it before throwing
 * (429 → 502, see remapUpstreamStatus) and keeps the original in
 * `upstreamStatus`, so the unremapped one is preferred and the list above can
 * name the statuses providers actually send.
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
            !!body &&
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
    const status = failure.upstreamStatus ?? failure.status;
    return typeof status === "number" ? status : undefined;
}

/**
 * Every place a provider might have put its reason. Content-policy detection is
 * a case-insensitive substring match, so the whole details bag is worth handing
 * over rather than the one field each client happens to parse out — the image
 * client nests the raw body under `details.body`, the text client puts the
 * parsed body in `details` itself.
 */
function upstreamFailureText(failure: UpstreamFailure): (string | null)[] {
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
    return [detailsText, failure.message ?? null];
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
    // A dead endpoint reaches us as the gateway's own 400 rather than as a
    // network error, because the gateway is the one that could not connect.
    if (
        !FALLBACK_ON_STATUS_CODES.includes(status) &&
        !isGatewayRoutingFailure(failure)
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
    /**
     * The entry that served, once a fallback has stepped in. It decides what
     * the generation cost us and, when it has an owner, who is paid.
     *
     * Absent on the model the caller asked for — which is the one they are
     * charged for however the request is eventually served.
     */
    entry?: GenerationModelEntry;
};

type PrimaryModel = {
    resolved: string;
    definition: ModelDefinition;
    communityEndpoint?: CommunityEndpointRuntime;
    fallbackEntries?: GenerationModelEntry[];
};

/**
 * The model the caller asked for, then each fallback its owner declared, in
 * order.
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
            // Absent on a catalog target, which is what tells the handlers to
            // route it through the static provider config instead of an
            // endpoint row, and what leaves it earning no owner reward.
            ...(entry.communityEndpoint && {
                communityEndpoint: entry.communityEndpoint,
            }),
            entry,
        });
    }
    return candidates;
}

/**
 * One upstream call that failed, as the loop saw it.
 *
 * `terminal` marks the failure that ended the request — the only thing about a
 * failed generation that the error response cannot say for itself, since it
 * carries no candidate name.
 */
export type FailedCall = {
    candidate: FallbackCandidate;
    error: unknown;
    startedAt: Date;
    endedAt: Date;
    terminal: boolean;
};

/**
 * Runs `attempt` against each candidate until one succeeds.
 *
 * Placed around the upstream call itself rather than around the request, so
 * authentication, balance, rate limiting and moderation run exactly once no
 * matter how many models are tried. Every candidate is tried at most once: the
 * dominant failure is an exhausted quota, and asking the same endpoint again
 * would only spend more of a budget that is already gone.
 *
 * Every failed call is appended to `failures`, including the one that ends the
 * request. Recording is not the same as retrying: this loop decides only which
 * candidate to try next, and leaves what any of it means to whoever reads the
 * list.
 *
 * Safe for streaming: the clients throw before returning a body, so a failed
 * attempt has sent the caller nothing.
 */
export async function withModelFallback<T>(
    candidates: FallbackCandidate[],
    attempt: (candidate: FallbackCandidate) => Promise<T>,
    failures?: FailedCall[],
): Promise<{ result: T; candidate: FallbackCandidate; index: number }> {
    for (const [index, candidate] of candidates.entries()) {
        // Timed from this attempt's own start. Measured from the request's, a
        // second attempt would report the first one's timeout as part of its
        // own latency.
        const startedAt = new Date();
        try {
            return { result: await attempt(candidate), candidate, index };
        } catch (error) {
            const terminal =
                index === candidates.length - 1 ||
                !isRetryableFallbackError(error);
            failures?.push({
                candidate,
                error,
                startedAt,
                endedAt: new Date(),
                terminal,
            });
            if (terminal) throw error;
        }
    }
    // Unreachable: the loop either returns or rethrows for a non-empty list, and
    // the primary is always the first candidate.
    throw new Error("Model fallback needs at least one candidate");
}
