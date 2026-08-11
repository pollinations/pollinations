// Cost-variant helpers used by registry model definitions. This module must
// stay free of runtime imports from registry.ts: image.ts/text.ts call these
// helpers at module-init time while registry.ts imports their service maps,
// so a value import back into registry.ts would create an evaluation-order
// cycle that silently empties MODEL_REGISTRY in bundled workers.
import type {
    CostDefinition,
    CostVariantMetadata,
    ModelDefinition,
    Usage,
    UsageType,
} from "./registry";

// Normalized request facts that can affect pricing. Set once per request by
// the service layer via the track middleware's pricing input, consumed only by
// selectCostVariant. Keep this vocabulary small: a key earns its place when a
// live model prices on it.
export type PricingInput = {
    resolution?: string;
    hasImage?: boolean;
    megapixels?: number;
    searchContextSize?: "low" | "high";
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

// Selector factory for provider long-context tiers with a strict boundary.
// Azure meters GPT requests as <272k / >272k context length, repricing the
// entire request once the threshold is crossed.
export function longContextAbove(minPromptTokens: number) {
    return ({ usage }: CostVariantContext): "long_context" | undefined =>
        totalPromptTokens(usage) > minPromptTokens ? "long_context" : undefined;
}

// OpenRouter pricing tiers apply when prompt tokens meet or exceed the
// advertised minimum.
export function longContextAtLeast(minPromptTokens: number) {
    return ({ usage }: CostVariantContext): "long_context" | undefined =>
        totalPromptTokens(usage) >= minPromptTokens
            ? "long_context"
            : undefined;
}

// Selects a named rate sheet when the request explicitly uses one of the
// model's non-default resolutions. The default resolution stays on base rates.
export function matchResolution<const R extends string>(...resolutions: R[]) {
    return ({ input }: CostVariantContext): R | undefined =>
        resolutions.find((resolution) => resolution === input?.resolution);
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
    costVariantMetadata: { [K in keyof V]: CostVariantMetadata },
    defaultCostVariantLabel: string,
): Pick<
    ModelDefinition,
    | "costVariants"
    | "selectCostVariant"
    | "costVariantMetadata"
    | "defaultCostVariantLabel"
> {
    return {
        costVariants,
        selectCostVariant,
        costVariantMetadata,
        defaultCostVariantLabel,
    };
}
