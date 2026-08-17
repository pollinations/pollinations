export type ModelCategory =
    | "text"
    | "image"
    | "audio"
    | "video"
    | "3d"
    | "embedding"
    | "realtime";

export type ModelDisplayCategory =
    | ModelCategory
    | "community-text"
    | "community-image"
    | "community-agent";

export type ModelCapability =
    | "tool_calling"
    | "reasoning"
    | "web_search"
    | "code_execution"
    | "pollinations_models";

export type PriceKind =
    | "text"
    | "image"
    | "3d"
    | "cached"
    | "cacheWrite"
    | "reasoning"
    | "video"
    | "audioIn"
    | "audioOut";

export type PriceDirection = "input" | "output";

export type PriceUnit = "token" | "second" | "request";

export type ModelPriceLine = {
    direction: PriceDirection;
    kind: PriceKind;
    price: string;
    unit: PriceUnit;
};

export type ModelPriceVariant = {
    name: string;
    label: string;
    description: string;
    prices: ModelPriceLine[];
};

export type ModelPriceAdjustment = {
    name: string;
    label: string;
    kind: string;
    price: string;
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

export type ModelPrice = {
    name: string;
    type: ModelCategory;
    community?: boolean;
    agent?: boolean;
    baseModel?: string;
    perUserRpm?: number | null;
    displayName?: string;
    description?: string;
    brand?: string;
    brandUrl?: string;
    inputModalities?: string[];
    outputModalities?: string[];
    capabilities: ModelCapability[];
    paidOnly?: boolean;
    free?: boolean;
    alpha?: boolean;
    addedDate?: number;
    inputSortPrice?: number;
    outputSortPrice?: number;
    prices: ModelPriceLine[];
    priceVariants?: ModelPriceVariant[];
    priceDefaultLabel?: string;
    priceAdjustments?: ModelPriceAdjustment[];
    // Real usage data from Tinybird (rolling 7-day average)
    realAvgCost?: number;
};
