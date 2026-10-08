import { useEffect, useState } from "react";
import {
    type ApiModelInfo,
    getModelPricesFromCatalog,
} from "../models/model-catalog.ts";
import type { BalanceAccess } from "../models/model-status-chips.tsx";
import { formatPriceLine } from "../models/price-badge.tsx";

const NEWS_INDEX_URL =
    "https://raw.githubusercontent.com/pollinations/pollinations/refs/heads/news/operations/social/news/index.json";

type Change = { before: unknown; after: unknown };

/** One official model change, built from PR gists by build_news_index.py. */
export type ModelNews = {
    id: string;
    model_id: string;
    title: string;
    /** Title of the model an alias now points away from (a replacement). */
    previous_title?: string;
    action: "NEW" | "UPDATE" | "RETIRE";
    category?: ApiModelInfo["category"];
    date: string;
    /** Retirements announced in a PR description (#16818). */
    status?: "scheduled" | "cancelled";
    previous_date?: string;
    pr: number;
    url: string;
    pricing_units?: {
        before?: ApiModelInfo["pricing_units"];
        after?: ApiModelInfo["pricing_units"];
    };
    changes: Partial<Record<string, Change>>;
};

export function formatNewsDate(date: string): string {
    if (!date) return "";
    const parsed = new Date(`${date}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) return date;
    return parsed.toLocaleDateString("en-US", {
        timeZone: "UTC",
        month: "short",
        day: "numeric",
    });
}

export type Highlight = {
    date: string;
    emoji?: string;
    title: string;
    text: string;
    app?: boolean;
    /** PRs the highlight comes from; older backfilled highlights have none. */
    prs?: number[];
};

/** Highlights for News: not apps (README only) and not PRs the Changelog already lists. */
export function newsHighlights(index: NewsIndex): Highlight[] {
    const listed = new Set(
        [...index.models, ...(index.api ?? [])].map(({ pr }) => pr),
    );
    return index.highlights.filter(
        ({ app, prs }) => !app && !prs?.some((pr) => listed.has(pr)),
    );
}

export type ApiField = { type: string; required: boolean };

/** One endpoint's change from the post-deploy docs PR (already live). */
export type ApiNews = {
    id: string;
    endpoint: string;
    /** The endpoint's one-line summary from APIDOCS.md. */
    summary?: string;
    action: "ADD" | "REMOVE" | "CHANGE";
    breaking: boolean;
    changes: {
        field: string;
        before: ApiField | null;
        after: ApiField | null;
    }[];
    date: string;
    pr: number;
    url: string;
};

export type NewsIndex = {
    models: ModelNews[];
    api?: ApiNews[];
    highlights: Highlight[];
};

export type CardDetail = {
    label: string;
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
): Map<string, { label: string; value: string; price: number }> {
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
            { ...formatPriceLine(line), price: Number(line.price) },
        ]),
    );
}

type PriceLines = ReturnType<typeof priceLines>;

/**
 * The change most price lines share (e.g. a provider fee): its factor and the
 * lines it covers, when at least two lines and half of all lines moved by it.
 */
function commonPriceChange(before: PriceLines, after: PriceLines) {
    const groups: { scale: number; keys: Set<string> }[] = [];
    for (const [key, { price }] of before) {
        const scale = (after.get(key)?.price ?? Number.NaN) / price;
        if (!Number.isFinite(scale) || Math.abs(scale - 1) < 0.002) continue;
        const group = groups.find((g) => Math.abs(g.scale - scale) < 0.002);
        if (group) group.keys.add(key);
        else groups.push({ scale, keys: new Set([key]) });
    }
    const [largest] = groups.sort((a, b) => b.keys.size - a.keys.size);
    const lines = new Set([...before.keys(), ...after.keys()]).size;
    return largest && largest.keys.size >= 2 && largest.keys.size * 2 >= lines
        ? { ...largest, all: largest.keys.size === lines }
        : undefined;
}

const listed = (names: string[]) =>
    names.length > 3
        ? `${names.slice(0, 3).join(", ")}, … (${names.length})`
        : names.join(", ");

/** Removed voices break requests that name them, so they come first. */
function voiceChange({ before, after }: Change): Omit<CardDetail, "label"> {
    const was = (before as string[] | null) ?? [];
    const now = (after as string[] | null) ?? [];
    if (!was.length) return { after: `new set: ${listed(now)}` };
    const removed = was.filter((voice) => !now.includes(voice));
    const added = now.filter((voice) => !was.includes(voice));
    return {
        before: removed.length ? `removed ${listed(removed)}` : undefined,
        after: added.length ? `added ${listed(added)}` : "none added",
    };
}

/** Shown with /models' Quest and Paid balance chips. */
const balance = (paidOnly: unknown): BalanceAccess =>
    paidOnly ? "paid" : "quest";

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
    if (news.action === "RETIRE") {
        // A postponed or withdrawn announcement shows what it replaced.
        if (!news.previous_date) return [];
        return [
            {
                label: "Date",
                before: formatNewsDate(news.previous_date),
                after:
                    news.status === "cancelled"
                        ? "cancelled"
                        : formatNewsDate(news.date),
            },
        ];
    }
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
    const replaced = news.changes.model_id;
    if (replaced) {
        details.push({
            label: "Model",
            before: String(replaced.before),
            after: `${replaced.after} (old ID still works)`,
        });
    }
    // Lines that moved differently: one row each, "Text in $0.1/M → $0.01/M".
    const common = commonPriceChange(before, after);
    for (const key of new Set([...before.keys(), ...after.keys()])) {
        const was = before.get(key);
        const now = after.get(key);
        if (was?.value === now?.value || common?.keys.has(key)) continue;
        details.push({
            label: "Price",
            before: `${(was ?? now)?.label} ${was?.value ?? "none"}`,
            after: now?.value ?? "removed",
        });
    }
    // Lines that share one change collapse into a single row.
    if (common) {
        const percent = Number(((common.scale - 1) * 100).toFixed(1));
        details.push({
            label: "Price",
            before: `${common.all ? "All" : "Other"} prices`,
            after: `${percent > 0 ? "+" : "−"}${Math.abs(percent)}%`,
        });
    }
    if (news.changes.paid_only) {
        details.push({
            label: "Balance",
            before: balance(news.changes.paid_only.before),
            after: balance(news.changes.paid_only.after),
        });
    }
    const voices = news.changes.voices;
    if (voices) {
        details.push({ label: "Voices", ...voiceChange(voices) });
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

/** Changes within today −30 to today +30 days, oldest first. */
export function visibleModelNews<T extends { date: string }>(
    models: T[],
    today: string,
) {
    const day = 24 * 60 * 60 * 1000;
    const from = new Date(Date.parse(today) - 30 * day)
        .toISOString()
        .slice(0, 10);
    const to = new Date(Date.parse(today) + 30 * day)
        .toISOString()
        .slice(0, 10);
    return models.filter(({ date }) => date >= from && date <= to);
}

const describeField = (field: ApiField) =>
    [field.type, field.required && "required"].filter(Boolean).join(", ");

/** One row per changed parameter or body field: "Body  seed: integer|null → integer". */
export function apiDetails(news: ApiNews): CardDetail[] {
    const what = news.summary
        ? [{ label: "Endpoint", after: news.summary }]
        : [];
    return [
        ...what,
        ...news.changes.map(({ field, before, after }) => {
            const [kind, location, ...rest] = field.split(":");
            const label =
                kind === "body"
                    ? "Body"
                    : `${location[0].toUpperCase()}${location.slice(1)}`;
            const name =
                kind === "body"
                    ? [location, ...rest].join(":")
                    : rest.join(":");
            if (!before && after) {
                return {
                    label,
                    before: name,
                    after: `added · ${describeField(after)}`,
                };
            }
            if (before && !after) {
                return {
                    label,
                    before: `${name}: ${describeField(before)}`,
                    after: "removed",
                };
            }
            return {
                label,
                before: `${name}: ${describeField(before as ApiField)}`,
                after: describeField(after as ApiField),
            };
        }),
    ];
}
