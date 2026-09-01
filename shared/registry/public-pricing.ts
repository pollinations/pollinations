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
