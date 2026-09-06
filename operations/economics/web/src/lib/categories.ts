import type { OpCloudRow, OpTransactionRow } from "../types";

// The vocabulary only. Which vendor belongs to which category lives in
// provider-registry.json; see transactionCategory in providerRegistry.ts.

export const CATEGORY_IDS = [
    "revenue",
    "compute",
    "infrastructure",
    "development",
    "operations",
    "revenue_share",
    "office",
    "admin",
    "payroll",
    "balance_sheet",
] as const;

export type Category = (typeof CATEGORY_IDS)[number];
export type CategoryValue = Category | "uncategorized";

export const EXPENSE_CATEGORY_ORDER = [
    "compute",
    "infrastructure",
    "development",
    "operations",
    "revenue_share",
    "office",
    "admin",
    "payroll",
] as const satisfies readonly Category[];

const CATEGORY_LABELS: Record<CategoryValue, string> = {
    revenue: "Revenue",
    compute: "Compute",
    infrastructure: "Infrastructure",
    development: "Development",
    operations: "Operations",
    revenue_share: "Revenue Share",
    office: "Office",
    admin: "Admin",
    payroll: "Payroll",
    balance_sheet: "Cash adjustments",
    uncategorized: "Uncategorized",
};

const KNOWN_CATEGORIES = new Set<string>(CATEGORY_IDS);

function normalize(value: string): string {
    return value.trim().toLowerCase();
}

export function categoryLabel(category: string): string {
    return CATEGORY_LABELS[category as CategoryValue] ?? category;
}

export function isCategory(category: string): category is Category {
    return KNOWN_CATEGORIES.has(category);
}

export function isComputeOrInfrastructureCategory(category: string): boolean {
    return category === "compute" || category === "infrastructure";
}

export function isBankMovement(row: Pick<OpTransactionRow, "kind">): boolean {
    return row.kind === "transaction";
}

export function cloudCategory(row: Pick<OpCloudRow, "type">): CategoryValue {
    const type = normalize(row.type);
    if (type === "gpu" || type === "inference") return "compute";
    if (type === "infra") return "infrastructure";
    return isCategory(type) ? type : "uncategorized";
}

export function forecastCategory(row: { category: string }): CategoryValue {
    const supplied = normalize(row.category);
    return isCategory(supplied) ? supplied : "uncategorized";
}
