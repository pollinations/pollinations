import type {
    CostDefinition,
    ModelDefinition,
    PriceDefinition,
    UsageType,
} from "./registry";

/** Values are keyed by rate-sheet name; the empty key selects base pricing. */
export type PricingDimension = {
    key: string;
    label: string;
    unit?: string;
    values: Record<string, string>;
};

export type PublicPricingDefinition = {
    label: string;
    quantity: number;
    unit: string;
    suffix?: string;
    option?: {
        group: string;
        value: string;
        label: string;
        default?: boolean;
        groupLabel?: string;
        valueLabel?: string;
        unit?: string;
    };
};

export type BillingRateDefinition = {
    id: string;
    description: string;
    kind: string;
    unit: string;
    unitCost: number;
    publicPricing: PublicPricingDefinition;
};

export type PublicPriceInfo = PublicPricingDefinition & {
    name: string;
    kind: string;
    price: string;
    currency: "pollen";
};

export function toFixedPoint(value: number): string {
    return value.toFixed(12).replace(/\.?0+$/, "");
}

export function publicPriceInfo(
    rate: BillingRateDefinition,
    priceMultiplier = 1,
): PublicPriceInfo {
    return {
        name: rate.id,
        kind: rate.kind,
        price: toFixedPoint(
            rate.unitCost * rate.publicPricing.quantity * priceMultiplier,
        ),
        currency: "pollen",
        ...rate.publicPricing,
    };
}

// Model-shape helpers live here rather than in registry.ts: registry.ts serves
// the catalogs, which now load through `import.meta.glob`, and the enter
// code-agent runtime bundles shared/ without Vite. Keeping these predicates
// free of catalog access is what lets that bundle import them at all.
// registry.ts re-exports them so callers can keep using the entry point.
export function derivePrice(
    costDefinition: CostDefinition,
    priceMultiplier: number,
): PriceDefinition {
    if (priceMultiplier === 1) return costDefinition;
    return Object.fromEntries(
        Object.entries(costDefinition).map(([k, v]) => [
            k,
            (v as number) * priceMultiplier,
        ]),
    ) as PriceDefinition;
}

/** The catalog's flat-rate rule: an explicit `flatRate`, or an image model with no prompt-token rate. */
export const isFlatRateModel = (definition: ModelDefinition): boolean =>
    definition.flatRate ??
    (definition.category === "image" &&
        definition.cost.promptTextTokens === undefined);

export const isVisibleModelDefinition = (
    definition: ModelDefinition,
): boolean => definition.hidden !== true && definition.fallbackOnly !== true;

/** Every cost sheet a model can bill at: its base cost and each variant over it. */
export function getCostSheetsForModel(svc: ModelDefinition): CostDefinition[] {
    return [
        svc.cost,
        ...Object.values(svc.costVariants ?? {}).map((variant) => ({
            ...svc.cost,
            ...variant,
        })),
    ];
}

/**
 * True when `target` costs no more than `primary` for every usage type. A
 * usage type the primary does not price counts as free, so a target that
 * charges for it is rejected.
 */
export function isFallbackPricingAllowed(
    primary: PriceDefinition,
    target: PriceDefinition,
): boolean {
    return Object.entries(target).every(
        ([usageType, price]) =>
            (price ?? 0) <= (primary[usageType as UsageType] ?? 0),
    );
}
