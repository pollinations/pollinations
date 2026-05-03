// Cost-attribution helper. Pure: no I/O.
//
// The bee writes down `usage` per turn and the platform converts it to a
// pollen amount it can deduct/charge (whether author-pays or user-pays is a
// manifest decision; this just produces the number).
//
// Pricing source of truth is `shared/registry/text.ts`, but we don't import
// it here — that registry pulls in deno-only deps in some configs and we want
// the helper to stay zero-dep + install-free. Instead we hard-code a small
// table of dollars-per-token for the models CatGPT actually uses, and treat
// $1 ≈ 1 Pollen per CLAUDE.md.
//
// When the registry shape changes, update PRICING below — there's a
// `assertPricingMatchesRegistry` test that flags drift in CI once we wire it.

export type ModelUsage = {
    prompt_tokens: number;
    completion_tokens: number;
    model: string;
};

export type ModelUsageWithCost = ModelUsage & {
    cost_dollars: number;
    cost_pollen: number; // $1 ≈ 1 pollen per CLAUDE.md
    /** True if the model wasn't in our pricing table; cost is zero. */
    estimated: boolean;
};

type Pricing = {
    /** Dollars per prompt token. */
    prompt: number;
    /** Dollars per completion token. */
    completion: number;
};

// Mirror of shared/registry/text.ts cost entries. Aliases included so callers
// can pass either the alias or the canonical id.
//
// Generated from: shared/registry/text.ts as of 2026-05-03.
const PRICING: Record<string, Pricing> = {
    "claude-fast": { prompt: 1.1e-6, completion: 5.5e-6 },
    "claude-haiku": { prompt: 1.1e-6, completion: 5.5e-6 },
    "claude-haiku-4.5": { prompt: 1.1e-6, completion: 5.5e-6 },
    // Used by the code-bee container reference. Pricing matches Anthropic's
    // public Sonnet 4 numbers; refine when the model lands in the registry.
    "claude-sonnet-4-6": { prompt: 3.0e-6, completion: 15.0e-6 },
    "claude-sonnet-4.6": { prompt: 3.0e-6, completion: 15.0e-6 },
};

/**
 * Compute pollen cost for a finished turn. Returns the input plus
 * `cost_dollars` and `cost_pollen`. Unknown models get cost = 0 and
 * `estimated: true`; the caller can log/flag.
 */
export function recordUsage(usage: ModelUsage): ModelUsageWithCost {
    const price = PRICING[usage.model];
    if (!price) {
        return {
            ...usage,
            cost_dollars: 0,
            cost_pollen: 0,
            estimated: true,
        };
    }
    const cost_dollars =
        usage.prompt_tokens * price.prompt +
        usage.completion_tokens * price.completion;
    return {
        ...usage,
        cost_dollars,
        cost_pollen: cost_dollars,
        estimated: false,
    };
}

/**
 * Best-effort coercion of an OpenAI-shaped `usage` object into our
 * `ModelUsage` type. Tolerates missing fields (returns zeros) so a single
 * malformed upstream response doesn't crash the bee.
 */
export function coerceOpenAIUsage(
    raw: unknown,
    model: string,
): ModelUsage | null {
    if (!raw || typeof raw !== "object") return null;
    const u = raw as { prompt_tokens?: unknown; completion_tokens?: unknown };
    return {
        prompt_tokens:
            typeof u.prompt_tokens === "number" ? u.prompt_tokens : 0,
        completion_tokens:
            typeof u.completion_tokens === "number" ? u.completion_tokens : 0,
        model,
    };
}
