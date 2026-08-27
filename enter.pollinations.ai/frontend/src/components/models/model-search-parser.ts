import { getModelDisplayName } from "./model-info.ts";
import type { ModelPrice } from "./types.ts";

type ParsedQuery = {
    terms: string[];
    filters: Map<string, string>;
};

export function parseQuery(query: string): ParsedQuery {
    const terms: string[] = [];
    const filters = new Map<string, string>();

    // Match key:value pairs (supports quoted values for multi-word matches)
    const tokenRegex = /(\w+):(?:"([^"]*)"|(\S+))/g;
    let lastIndex = 0;

    for (const match of query.matchAll(tokenRegex)) {
        // Add any text before this filter as a free-text term
        const before = query.slice(lastIndex, match.index).trim();
        if (before) {
            for (const term of before.split(/\s+/)) {
                if (term) terms.push(term);
            }
        }
        const key = match[1].toLowerCase();
        const value = (match[2] ?? match[3]).toLowerCase();
        filters.set(key, value);
        lastIndex = (match.index ?? 0) + match[0].length;
    }

    // Add remaining text as free-text terms
    const remaining = query.slice(lastIndex).trim();
    if (remaining) {
        for (const term of remaining.split(/\s+/)) {
            if (term) terms.push(term);
        }
    }

    return { terms, filters };
}

function modelId(model: ModelPrice): string {
    return `${model.brand ? `${model.brand.toLowerCase()}/` : ""}${model.name.toLowerCase()}`;
}

function matchesFilters(
    model: ModelPrice,
    filters: Map<string, string>,
): boolean {
    for (const [key, value] of filters) {
        switch (key) {
            case "access":
                if (value === "paid" && !model.paidOnly) return false;
                if (value === "free" && model.paidOnly) return false;
                if (value === "quest" && model.paidOnly) return false;
                if (value === "quest" && !model.free && !model.paidOnly)
                    return false;
                break;
            case "owner":
                if (!model.community) return false;
                if (model.brand?.toLowerCase() !== value) return false;
                break;
            case "id":
                if (
                    !modelId(model).includes(value) &&
                    !model.name.toLowerCase().includes(value)
                )
                    return false;
                break;
            case "type":
                if (model.type !== value) return false;
                break;
            case "capability":
                if (
                    !model.capabilities.includes(
                        value as ModelPrice["capabilities"][number],
                    )
                )
                    return false;
                break;
            default:
                // Unknown filter — ignore it (no rejection)
                break;
        }
    }
    return true;
}

function matchesFreeText(model: ModelPrice, terms: string[]): boolean {
    if (terms.length === 0) return true;

    const displayName = getModelDisplayName(model) ?? "";
    const haystack = [
        displayName,
        model.name,
        model.brand ?? "",
        model.description ?? "",
        model.baseModel ?? "",
        ...(model.inputModalities ?? []),
        ...(model.outputModalities ?? []),
        ...model.capabilities,
    ]
        .join(" ")
        .toLowerCase();

    return terms.every((term) => haystack.includes(term));
}

export function matchesQuery(model: ModelPrice, query: string): boolean {
    if (!query) return true;
    const parsed = parseQuery(query.toLowerCase());
    return (
        matchesFilters(model, parsed.filters) &&
        matchesFreeText(model, parsed.terms)
    );
}
