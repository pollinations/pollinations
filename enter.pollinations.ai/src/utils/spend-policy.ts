export const SPEND_POLICIES = ["auto", "tier_only", "paid_only"] as const;

export type SpendPolicy = (typeof SPEND_POLICIES)[number];

export const DEFAULT_SPEND_POLICY: SpendPolicy = "auto";

export function isSpendPolicy(value: unknown): value is SpendPolicy {
    return (
        typeof value === "string" &&
        (SPEND_POLICIES as readonly string[]).includes(value)
    );
}

export function parseSpendPolicy(value: unknown): SpendPolicy {
    return isSpendPolicy(value) ? value : DEFAULT_SPEND_POLICY;
}

export function getSpendPolicyLabel(policy: SpendPolicy): string {
    switch (policy) {
        case "tier_only":
            return "Free only";
        case "paid_only":
            return "Paid only";
        default:
            return "Auto";
    }
}

export function getSpendPolicyDescription(policy: SpendPolicy): string {
    switch (policy) {
        case "tier_only":
            return "Never spend paid pollen. Requests stop when free pollen runs out.";
        case "paid_only":
            return "Skip free pollen and use pack or crypto balance only.";
        default:
            return "Use free pollen first, then fall back to paid balance.";
    }
}
