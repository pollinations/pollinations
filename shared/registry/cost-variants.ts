// Cost-variant helpers used by registry model definitions. This module must
// stay free of runtime imports from registry.ts: image.ts/text.ts call these
// helpers at module-init time while registry.ts imports their service maps,
// so a value import back into registry.ts would create an evaluation-order
// cycle that silently empties MODEL_REGISTRY in bundled workers.
import type {
    CostDefinition,
    ModelDefinition,
    Usage,
    UsageType,
} from "./registry";

// Normalized request facts that can affect pricing (resolution, input mode,
// option toggles). Set once per request by the service layer via the track
// middleware's pricing input, consumed only by selectCostVariant. Keep this
// vocabulary small: a key earns its place when a live model prices on it.
export type PricingInput = {
    resolution?: string;
    hasImage?: boolean;
    audio?: boolean;
    draft?: boolean;
};

export type CostVariantContext = {
    usage: Usage;
    input?: PricingInput;
};

// Prompt-side token count used by long-context selectors: every prompt token
// bucket counts toward the provider's context threshold (cached and modality
// tokens included); promptAudioSeconds is a duration, not a token count.
const PROMPT_TOKEN_TYPES: UsageType[] = [
    "promptTextTokens",
    "promptCachedTokens",
    "promptCacheWriteTokens",
    "promptAudioTokens",
    "promptImageTokens",
    "promptVideoTokens",
];

export function totalPromptTokens(usage: Usage): number {
    return PROMPT_TOKEN_TYPES.reduce(
        (total, usageType) => total + (usage[usageType] ?? 0),
        0,
    );
}

// Selector factory for provider long-context tiers: strictly greater than the
// threshold reprices the ENTIRE request (Vertex: "If a query input context is
// longer than 200K tokens, all tokens (input and output) are charged at long
// context rates"; Azure meters requests as <272k / >272k context length).
export function longContextAbove(minPromptTokens: number) {
    return ({ usage }: CostVariantContext): "long_context" | undefined =>
        totalPromptTokens(usage) > minPromptTokens ? "long_context" : undefined;
}

// Pairs variant sheets with their selector so TypeScript checks that the
// selector can only return names that exist in the sheets.
export function defineCostVariants<
    const V extends Record<string, CostDefinition>,
>(
    costVariants: V,
    selectCostVariant: (
        context: CostVariantContext,
    ) => (keyof V & string) | undefined,
): Pick<ModelDefinition, "costVariants" | "selectCostVariant"> {
    return { costVariants, selectCostVariant };
}
