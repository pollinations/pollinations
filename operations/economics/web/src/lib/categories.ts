import type { OpCloudRow, OpForecastRow, OpTransactionRow } from "../types";

export const CATEGORY_IDS = [
    "revenue",
    "compute",
    "infrastructure",
    "development",
    "operations",
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
    office: "Office",
    admin: "Admin",
    payroll: "Payroll",
    balance_sheet: "Cash adjustments",
    uncategorized: "Uncategorized",
};

const KNOWN_CATEGORIES = new Set<string>(CATEGORY_IDS);

// One manually reviewed source of truth for the business purpose of each cash
// vendor. Mixed-purpose vendors are handled explicitly below.
const TRANSACTION_VENDOR_CATEGORIES: Record<string, Category> = {
    alibaba: "compute",
    amazon: "office",
    aws: "compute",
    ayushman: "payroll",
    azure: "compute",
    "barbara-khamouguinoff": "office",
    buffer: "operations",
    bytedance: "compute",
    canva: "operations",
    cloudflare: "infrastructure",
    daytona: "infrastructure",
    deel: "payroll",
    deepinfra: "compute",
    "denns-biomarkt": "office",
    discord: "operations",
    elevenlabs: "compute",
    enty: "admin",
    estonia: "admin",
    fal: "compute",
    figma: "operations",
    fireworks: "compute",
    gaswerksiedlung: "office",
    google: "compute",
    "google-workspace": "operations",
    inferenceport: "compute",
    investment: "balance_sheet",
    "io.net": "compute",
    lambda: "compute",
    mistral: "compute",
    naturenergie: "office",
    notion: "operations",
    openai: "development",
    openrouter: "compute",
    perplexity: "compute",
    protonvpn: "operations",
    pruna: "compute",
    replicate: "compute",
    retell: "compute",
    runpod: "compute",
    "self-issued": "balance_sheet",
    slack: "operations",
    "so-lab-x": "payroll",
    "space-berlin": "office",
    stability: "compute",
    stripe: "revenue",
    tele2: "operations",
    thot: "payroll",
    tinybird: "infrastructure",
    tools: "operations",
    typeless: "operations",
    "vast.ai": "compute",
    vast: "compute",
    vastai: "compute",
    vercel: "compute",
    windsurf: "development",
    wispr: "operations",
    xai: "compute",
    "zara-home": "office",
};

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

export function transactionCategory(
    row: Pick<
        OpTransactionRow,
        "amount" | "category" | "description" | "kind" | "vendor"
    >,
): CategoryValue {
    if (row.kind === "opening_balance") return "balance_sheet";

    const vendor = normalize(row.vendor);
    const description = normalize(row.description);

    if (vendor === "anthropic") {
        return description.includes("subscription") || description === "claude"
            ? "development"
            : "compute";
    }
    if (vendor === "github") {
        return description.includes("sponsor") ? "revenue" : "development";
    }
    if (vendor === "openai") {
        return description.includes("chatgpt") ||
            description.includes("chat gpt")
            ? "development"
            : "compute";
    }
    if (vendor === "polar") {
        return description.includes("hubben") || row.amount > 0
            ? "revenue"
            : description.includes("myceli-ai")
              ? "balance_sheet"
              : "admin";
    }
    if (vendor === "wise") {
        return description.includes("cashback") || row.amount > 0
            ? "revenue"
            : "admin";
    }

    const mapped = TRANSACTION_VENDOR_CATEGORIES[vendor];
    if (mapped) return mapped;

    const supplied = normalize(row.category);
    return isCategory(supplied) ? supplied : "uncategorized";
}

export function isBankMovement(row: Pick<OpTransactionRow, "kind">): boolean {
    return row.kind === "transaction";
}

export function runwayLineItem(category: string, vendor: string): string {
    if (category === "operations" && normalize(vendor) === "tele2") {
        return "Telecom";
    }
    return vendor;
}

export function cloudCategory(row: Pick<OpCloudRow, "type">): CategoryValue {
    const type = normalize(row.type);
    if (type === "gpu" || type === "inference") return "compute";
    if (type === "infra") return "infrastructure";
    return isCategory(type) ? type : "uncategorized";
}

export function forecastCategory(
    row: Pick<OpForecastRow, "category">,
): CategoryValue {
    const supplied = normalize(row.category);
    return isCategory(supplied) ? supplied : "uncategorized";
}
