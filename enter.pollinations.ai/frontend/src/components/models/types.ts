export type ModelCategory =
    | "text"
    | "image"
    | "audio"
    | "video"
    | "embedding"
    | "realtime";

export type ModelCapability =
    | "tool_calling"
    | "reasoning"
    | "web_search"
    | "code_execution";

export type PriceKind =
    | "text"
    | "image"
    | "cached"
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

export type ModelPrice = {
    name: string;
    type: ModelCategory;
    displayName?: string;
    description?: string;
    brand?: string;
    inputModalities?: string[];
    outputModalities?: string[];
    capabilities: ModelCapability[];
    paidOnly?: boolean;
    alpha?: boolean;
    addedDate?: number;
    inputSortPrice?: number;
    outputSortPrice?: number;
    prices: ModelPriceLine[];
    // Real usage data from Tinybird (rolling 7-day average)
    realAvgCost?: number;
};

export type Modalities = {
    input: string[];
    output: string[];
};
