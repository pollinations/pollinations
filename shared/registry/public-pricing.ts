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

export type PublicPriceInfo = PublicPricingDefinition & {
    name: string;
    kind: string;
    price: string;
    currency: "pollen";
};

export function toFixedPoint(value: number): string {
    return value.toFixed(12).replace(/\.?0+$/, "");
}

export function publicPriceInfo({
    name,
    kind,
    unitPrice,
    publicPricing,
}: {
    name: string;
    kind: string;
    unitPrice: number;
    publicPricing: PublicPricingDefinition;
}): PublicPriceInfo {
    return {
        name,
        kind,
        price: toFixedPoint(unitPrice * publicPricing.quantity),
        currency: "pollen",
        ...publicPricing,
    };
}
