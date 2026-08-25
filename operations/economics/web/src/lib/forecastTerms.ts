export type ForecastMethod = "fixed" | "funded" | "last" | "one_off";

export type ForecastPaymentTiming = "direct" | "postpaid" | "prepaid";

export type ForecastAmount = {
    amount: number;
    currency: "EUR" | "USD";
};

export type ScheduledForecastAmount = ForecastAmount & {
    month: string;
    note: string;
};

export type ForecastLineRule = {
    method: ForecastMethod;
    paymentTiming: ForecastPaymentTiming | null;
    automaticUsage?: boolean;
    fixedAmounts?: readonly ForecastAmount[];
    activeFrom?: string;
    activeThrough?: string;
    scheduledAmounts?: readonly ScheduledForecastAmount[];
};

export type AutomaticForecastRule = ForecastLineRule & {
    method: "last";
    paymentTiming: ForecastPaymentTiming;
    automaticUsage: true;
};

// Reviewed source of truth for every line currently shown in Runway. The rule
// determines both the visible badges and whether metered usage is projected.
// New lines remain visibly unmodeled until they are added here.
const FORECAST_RULE_BY_LINE: Record<string, ForecastLineRule> = {
    // Revenue
    "github|revenue": { method: "one_off", paymentTiming: "direct" },
    "polar|revenue": { method: "one_off", paymentTiming: "direct" },
    "stripe|revenue": { method: "last", paymentTiming: "direct" },
    "wise|revenue": { method: "one_off", paymentTiming: "direct" },

    // Cash adjustments
    "deel|balance_sheet": {
        method: "one_off",
        paymentTiming: "direct",
        scheduledAmounts: [
            {
                month: "2026-08",
                amount: 12_036.42,
                currency: "EUR",
                note: "Thomas employment deposit refund",
            },
            {
                month: "2026-12",
                amount: 13_204.82,
                currency: "EUR",
                note: "Elliot employment deposit refund",
            },
        ],
    },
    "fx revaluation|balance_sheet": {
        method: "one_off",
        paymentTiming: null,
    },
    "investment|balance_sheet": {
        method: "one_off",
        paymentTiming: "direct",
    },
    "polar|balance_sheet": { method: "one_off", paymentTiming: "direct" },
    "pre-window movements|balance_sheet": {
        method: "one_off",
        paymentTiming: "direct",
    },
    "self-issued|balance_sheet": {
        method: "one_off",
        paymentTiming: "direct",
    },
    "thomas-haferlach|balance_sheet": {
        method: "one_off",
        paymentTiming: "direct",
    },

    // Metered compute and infrastructure that should project from OP Cloud.
    "alibaba|compute": {
        method: "last",
        paymentTiming: "prepaid",
        automaticUsage: true,
    },
    "aws|compute": {
        method: "last",
        paymentTiming: "postpaid",
        automaticUsage: true,
    },
    "aws|infrastructure": {
        method: "last",
        paymentTiming: "postpaid",
        automaticUsage: true,
    },
    "azure|compute": {
        method: "last",
        paymentTiming: "postpaid",
        automaticUsage: true,
    },
    "azure|infrastructure": {
        method: "last",
        paymentTiming: "postpaid",
        automaticUsage: true,
    },
    "cloudflare|infrastructure": {
        method: "last",
        paymentTiming: "postpaid",
        automaticUsage: true,
    },
    "deepinfra|compute": {
        method: "last",
        paymentTiming: "prepaid",
        automaticUsage: true,
    },
    "elevenlabs|compute": {
        method: "fixed",
        paymentTiming: "direct",
        fixedAmounts: [{ amount: -299, currency: "USD" }],
    },
    "fal|compute": {
        method: "last",
        paymentTiming: "prepaid",
        automaticUsage: true,
    },
    "fireworks|compute": {
        method: "last",
        paymentTiming: "prepaid",
        automaticUsage: true,
    },
    "google|compute": {
        method: "last",
        paymentTiming: "postpaid",
        automaticUsage: true,
    },
    "google|infrastructure": {
        method: "last",
        paymentTiming: "postpaid",
        automaticUsage: true,
    },
    "inferenceport|compute": {
        method: "last",
        paymentTiming: "prepaid",
        automaticUsage: true,
    },
    "mistral|compute": {
        method: "last",
        paymentTiming: "prepaid",
        automaticUsage: true,
    },
    "openrouter|compute": {
        method: "last",
        paymentTiming: "prepaid",
        automaticUsage: true,
    },
    "perplexity|compute": {
        method: "last",
        paymentTiming: "prepaid",
        automaticUsage: true,
    },
    "pruna|compute": {
        method: "last",
        paymentTiming: "prepaid",
        automaticUsage: true,
    },
    "replicate|compute": {
        method: "last",
        paymentTiming: "prepaid",
        automaticUsage: true,
    },
    "runpod|compute": { method: "one_off", paymentTiming: "prepaid" },
    "vast.ai|compute": {
        method: "last",
        paymentTiming: "prepaid",
        automaticUsage: true,
    },
    "vercel|compute": {
        method: "last",
        paymentTiming: "prepaid",
        automaticUsage: true,
    },
    "xai|compute": {
        method: "last",
        paymentTiming: "postpaid",
        automaticUsage: true,
    },

    // Reviewed historical or discontinued metered lines. One-time means their
    // observed cash stays historical and is never repeated automatically.
    "anthropic|compute": { method: "one_off", paymentTiming: "prepaid" },
    "bytedance|compute": { method: "one_off", paymentTiming: "postpaid" },
    "daytona|infrastructure": {
        method: "one_off",
        paymentTiming: "direct",
    },
    "io.net|compute": { method: "one_off", paymentTiming: "prepaid" },
    "lambda|compute": { method: "one_off", paymentTiming: "direct" },
    "retell|compute": { method: "one_off", paymentTiming: "direct" },
    "stability|compute": { method: "one_off", paymentTiming: "prepaid" },

    // Development
    "anthropic|development": {
        method: "fixed",
        paymentTiming: "direct",
        fixedAmounts: [{ amount: -360, currency: "EUR" }],
    },
    "github|development": { method: "last", paymentTiming: "direct" },
    "openai|development": {
        method: "fixed",
        paymentTiming: "direct",
        fixedAmounts: [{ amount: -600, currency: "USD" }],
    },
    "typeless|development": {
        method: "one_off",
        paymentTiming: "direct",
    },
    "windsurf|development": {
        method: "one_off",
        paymentTiming: "direct",
    },
    "wispr|development": { method: "one_off", paymentTiming: "direct" },

    // Operations
    "buffer|operations": { method: "last", paymentTiming: "direct" },
    "canva|operations": { method: "last", paymentTiming: "direct" },
    "discord|operations": { method: "last", paymentTiming: "direct" },
    "google-workspace|operations": {
        method: "fixed",
        paymentTiming: "direct",
        fixedAmounts: [{ amount: -33.43, currency: "EUR" }],
    },
    "notion|operations": { method: "one_off", paymentTiming: "direct" },
    "protonvpn|operations": { method: "last", paymentTiming: "direct" },
    "slack|operations": { method: "last", paymentTiming: "direct" },
    "tele2|operations": { method: "fixed", paymentTiming: "direct" },
    "telecom|operations": { method: "fixed", paymentTiming: "direct" },

    // Office
    "barbara-khamouguinoff|office": {
        method: "one_off",
        paymentTiming: "direct",
    },
    "cleaning|office": { method: "one_off", paymentTiming: "direct" },
    "food & drink|office": { method: "one_off", paymentTiming: "direct" },
    "furniture & equipment|office": {
        method: "one_off",
        paymentTiming: "direct",
    },
    "naturenergie|office": { method: "last", paymentTiming: "direct" },
    "rent & utilities|office": { method: "last", paymentTiming: "direct" },

    // Admin and payroll
    "accounting & filings|admin": {
        method: "fixed",
        paymentTiming: "direct",
    },
    "enty|admin": {
        method: "fixed",
        paymentTiming: "direct",
        fixedAmounts: [{ amount: -417.7, currency: "EUR" }],
        activeThrough: "2026-12",
    },
    "estonia|admin": { method: "one_off", paymentTiming: "direct" },
    "replacement-accountant|admin": {
        method: "fixed",
        paymentTiming: "direct",
        fixedAmounts: [{ amount: -200, currency: "EUR" }],
        activeFrom: "2027-01",
    },
    "tax office|admin": { method: "one_off", paymentTiming: "direct" },
    "taxes|admin": { method: "one_off", paymentTiming: "direct" },
    "ayushman|payroll": { method: "one_off", paymentTiming: "direct" },
    "deel|payroll": {
        method: "fixed",
        paymentTiming: "direct",
        fixedAmounts: [
            { amount: -3_523.74, currency: "EUR" },
            { amount: -537, currency: "USD" },
        ],
        activeThrough: "2026-11",
    },
    "so-lab-x|payroll": { method: "one_off", paymentTiming: "direct" },
    "thot|payroll": { method: "one_off", paymentTiming: "direct" },

    // Active services already represented by reviewed forecast facts.
    "tinybird|infrastructure": { method: "last", paymentTiming: "direct" },
    "tools|operations": { method: "last", paymentTiming: "direct" },
};

function key(vendor: string, category: string): string {
    return `${vendor.trim().toLowerCase()}|${category.trim().toLowerCase()}`;
}

export function forecastLineRule(
    vendor: string,
    category: string,
): ForecastLineRule | null {
    return FORECAST_RULE_BY_LINE[key(vendor, category)] ?? null;
}

export function forecastRuleEntries(): {
    vendor: string;
    category: string;
    rule: ForecastLineRule;
}[] {
    return Object.entries(FORECAST_RULE_BY_LINE).map(([line, rule]) => {
        const separator = line.indexOf("|");
        return {
            vendor: line.slice(0, separator),
            category: line.slice(separator + 1),
            rule,
        };
    });
}

export function forecastPaymentTiming(
    vendor: string,
    category: string,
): ForecastPaymentTiming | null {
    return forecastLineRule(vendor, category)?.paymentTiming ?? null;
}

export function automaticForecastRule(
    vendor: string,
    category: string,
): AutomaticForecastRule | null {
    const rule = forecastLineRule(vendor, category);
    if (
        !rule?.automaticUsage ||
        rule.method !== "last" ||
        rule.paymentTiming == null
    ) {
        return null;
    }
    return rule as AutomaticForecastRule;
}
