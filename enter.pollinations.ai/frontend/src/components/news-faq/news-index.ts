import { useEffect, useState } from "react";
import {
    type ApiModelInfo,
    getModelPricesFromCatalog,
} from "../models/model-catalog.ts";
import { formatPriceLine } from "../models/price-badge.tsx";

const NEWS_INDEX_URL =
    "https://raw.githubusercontent.com/pollinations/pollinations/refs/heads/news/operations/social/news/index.json";

type Change = { before: unknown; after: unknown };

/** One official model change, built from PR gists by build_news_index.py. */
export type ModelNews = {
    id: string;
    model_id: string;
    title: string;
    action: "NEW" | "UPDATE" | "RETIRE";
    category?: ApiModelInfo["category"];
    date: string;
    scheduled: boolean;
    pr: number;
    url: string;
    pricing_units?: {
        before?: ApiModelInfo["pricing_units"];
        after?: ApiModelInfo["pricing_units"];
    };
    changes: Partial<Record<string, Change>>;
};

export type Highlight = {
    date: string;
    emoji?: string;
    title: string;
    text: string;
    app?: boolean;
};

export type NewsIndex = { models: ModelNews[]; highlights: Highlight[] };

export type CardDetail = {
    label: "Price" | "Balance" | "Capability";
    before?: string;
    after: string;
};

let request: Promise<NewsIndex> | undefined;

/** Fetches index.json once per page load; both news sections share it. */
export function useNewsIndex(): NewsIndex | undefined {
    const [index, setIndex] = useState<NewsIndex>();
    useEffect(() => {
        request ??= fetch(NEWS_INDEX_URL).then((res) => {
            if (!res.ok) throw new Error(`News index: HTTP ${res.status}`);
            return res.json() as Promise<NewsIndex>;
        });
        request.then(setIndex).catch((error) => {
            request = undefined;
            console.error("Failed to fetch news index:", error);
        });
    }, []);
    return index;
}

function priceLines(
    news: ModelNews,
    side: "before" | "after",
): Map<string, { label: string; value: string }> {
    const pricing = news.changes.pricing?.[side] as ApiModelInfo["pricing"];
    if (!pricing) return new Map();
    const [model] = getModelPricesFromCatalog([
        {
            name: news.model_id,
            category: news.category,
            pricing,
            pricing_units: news.pricing_units?.[side] ?? undefined,
        },
    ]);
    return new Map(
        (model?.prices ?? []).map((line) => [
            `${line.direction}:${line.kind}`,
            formatPriceLine(line),
        ]),
    );
}

const balance = (paidOnly: unknown) =>
    paidOnly ? "Paid Pollen only" : "Quest or Paid Pollen";

const list = (value: unknown) =>
    Array.isArray(value) && value.length
        ? value.map((item) => String(item).replaceAll("_", " ")).join(", ")
        : "none";

const count = (unit: string) => (value: unknown) =>
    typeof value === "number"
        ? `${value.toLocaleString("en-US")}${unit}`
        : "none";

const CAPABILITY_FIELDS: Record<string, [string, (value: unknown) => string]> =
    {
        capabilities: ["Features", list],
        input_modalities: ["Input", list],
        output_modalities: ["Output", list],
        context_length: ["Context", count(" tokens")],
        per_user_rpm: ["Rate limit", count(" requests/min per user")],
        max_reference_images: ["Reference images", count("")],
    };

/** The changed values a model card shows, under Price, Balance and Capability. */
export function cardDetails(news: ModelNews): CardDetail[] {
    if (news.action === "RETIRE") return [];
    const details: CardDetail[] = [];
    const before = priceLines(news, "before");
    const after = priceLines(news, "after");
    if (news.action === "NEW") {
        if (after.size) {
            details.push({
                label: "Price",
                after: [...after.values()]
                    .map(({ label, value }) => `${label} ${value}`)
                    .join(" · "),
            });
        }
        details.push({
            label: "Balance",
            after: balance(news.changes.paid_only?.after),
        });
        return details;
    }
    // One row per changed price line: "Text in $0.1/M → $0.01/M".
    for (const key of new Set([...before.keys(), ...after.keys()])) {
        const was = before.get(key);
        const now = after.get(key);
        if (was?.value === now?.value) continue;
        details.push({
            label: "Price",
            before: `${(was ?? now)?.label} ${was?.value ?? "none"}`,
            after: now?.value ?? "removed",
        });
    }
    if (news.changes.paid_only) {
        details.push({
            label: "Balance",
            before: balance(news.changes.paid_only.before),
            after: balance(news.changes.paid_only.after),
        });
    }
    for (const [field, [name, format]] of Object.entries(CAPABILITY_FIELDS)) {
        const change = news.changes[field];
        if (change) {
            details.push({
                label: "Capability",
                before: `${name}: ${format(change.before)}`,
                after: format(change.after),
            });
        }
    }
    return details;
}

/** Model changes within today −7 to today +30 days, oldest first. */
export function visibleModelNews(models: ModelNews[], today: string) {
    const day = 24 * 60 * 60 * 1000;
    const from = new Date(Date.parse(today) - 7 * day)
        .toISOString()
        .slice(0, 10);
    const to = new Date(Date.parse(today) + 30 * day)
        .toISOString()
        .slice(0, 10);
    return models.filter(({ date }) => date >= from && date <= to);
}
