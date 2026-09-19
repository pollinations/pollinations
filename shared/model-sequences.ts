import type { Category, ModelDefinition } from "./registry/registry.ts";
import type { EventType } from "./schemas/generation-event.ts";

// A model sequence ("virtual My Model") is an ordered list of existing model
// ids. The first id is the primary: it supplies the quoted price, balance
// class, modality, endpoints, and capabilities. The remaining ids are tried
// in order through the shared fallback loop. V1 keeps sequences private to
// their owner, with no markup and no owner reward.
export const MODEL_SEQUENCE_MAX_FALLBACKS = 3;
export const MODEL_SEQUENCE_MAX_MODELS = 1 + MODEL_SEQUENCE_MAX_FALLBACKS;
export const MODEL_SEQUENCE_NAME_MAX_LENGTH = 120;
export const MODEL_SEQUENCE_TITLE_MAX_LENGTH = 42;
export const MODEL_SEQUENCE_DESCRIPTION_MAX_LENGTH = 160;
export const MODEL_SEQUENCE_NAME_REGEX = /^[A-Za-z0-9._:-]+$/;

/** Canonical model id of a sequence: `<owner-github-username>/<name>`. */
export function modelSequenceModelId(
    ownerGithubUsername: string,
    name: string,
): string {
    return `${ownerGithubUsername}/${name}`;
}

export function parseModelSequenceId(
    modelId: string,
): { ownerGithubUsername: string; name: string } | null {
    const slash = modelId.indexOf("/");
    if (slash <= 0 || slash === modelId.length - 1) return null;
    const ownerGithubUsername = modelId.slice(0, slash);
    const name = modelId.slice(slash + 1);
    if (name.includes("/")) return null;
    if (!MODEL_SEQUENCE_NAME_REGEX.test(name)) return null;
    return { ownerGithubUsername, name };
}

/**
 * The gateway event type a sequence member belongs to. Members must share one
 * event type so a sequence answers on a single request surface.
 */
export function modelSequenceEventType(category: Category): EventType {
    if (category === "audio") return "generate.audio";
    if (category === "embedding") return "generate.embedding";
    if (category === "realtime") return "generate.realtime";
    if (category === "text") return "generate.text";
    return "generate.image";
}

/**
 * A fallback cannot cost more per unit than the primary the caller was
 * quoted: the caller is billed at the primary's rates whichever model serves,
 * so a pricier fallback would either run at a loss or bill more than quoted.
 * Rates are compared per usage type after applying each definition's own
 * price multiplier, so static and community definitions compare uniformly.
 * A usage type the primary does not price rejects a paid target rate.
 */
export function isSequenceFallbackPricingAllowed(
    primary: ModelDefinition,
    target: ModelDefinition,
): boolean {
    for (const [usageType, targetRate] of Object.entries(target.cost)) {
        if (typeof targetRate !== "number") continue;
        const effectiveTarget = targetRate * target.priceMultiplier;
        if (effectiveTarget <= 0) continue;
        const primaryRate =
            primary.cost[usageType as keyof typeof primary.cost];
        if (typeof primaryRate !== "number") return false;
        if (effectiveTarget > primaryRate * primary.priceMultiplier) {
            return false;
        }
    }
    return true;
}

/**
 * A fallback cannot require a balance bucket the caller was never required to
 * have for the primary model. A paid-only primary may fall back to either
 * kind.
 */
export function isSequenceFallbackBalanceAllowed(
    primary: ModelDefinition,
    target: ModelDefinition,
): boolean {
    return !target.paidOnly || primary.paidOnly === true;
}
