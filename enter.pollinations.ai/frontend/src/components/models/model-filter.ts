import { getModelDisplayName } from "./model-info.ts";
import type { ModelPrice } from "./types.ts";

type FilterToken = { key: string; value: string };

export type ParsedQuery = {
    filters: FilterToken[];
    terms: string[];
};

// Matches key:value tokens where key is word chars/hyphens, value is non-whitespace
const FILTER_RE = /(\w[\w-]*):([\S]+)/g;

export function parseQuery(raw: string): ParsedQuery {
    const lower = raw.trim().toLowerCase();
    const filters: FilterToken[] = [];
    let cleanText = "";
    let lastIndex = 0;

    for (const match of lower.matchAll(FILTER_RE)) {
        cleanText += lower.slice(lastIndex, match.index);
        lastIndex = (match.index ?? 0) + match[0].length;
        filters.push({ key: match[1], value: match[2] });
    }
    cleanText += lower.slice(lastIndex);

    const terms = cleanText.trim().split(/\s+/).filter(Boolean);
    return { filters, terms };
}

function communityOwner(model: ModelPrice): string | undefined {
    if (!model.community) return undefined;
    const slash = model.name.indexOf("/");
    return slash > 0 ? model.name.slice(0, slash) : undefined;
}

function matchesFilter(model: ModelPrice, key: string, value: string): boolean {
    switch (key) {
        case "access":
            if (value === "paid") return model.paidOnly === true;
            if (value === "free") return model.free === true;
            if (value === "quest") return !model.paidOnly && !model.free;
            return false;
        case "owner": {
            const owner = communityOwner(model);
            return owner !== undefined && owner === value;
        }
        case "id":
            return model.name.toLowerCase().includes(value);
        case "type":
            if (value === "agent") return model.agent === true;
            return model.type === value;
        case "capability":
            // Accept both underscore and hyphen forms (e.g. tool_calling / tool-calling)
            return model.capabilities.some(
                (cap) => cap === value || cap.replace(/_/g, "-") === value,
            );
        default:
            return false;
    }
}

export function matchesModel(model: ModelPrice, parsed: ParsedQuery): boolean {
    for (const filter of parsed.filters) {
        if (!matchesFilter(model, filter.key, filter.value)) return false;
    }

    if (parsed.terms.length > 0) {
        const displayName = getModelDisplayName(model) ?? "";
        const haystack = [
            model.name,
            displayName,
            model.description ?? "",
            model.brand ?? "",
            model.baseModel ?? "",
            ...(model.inputModalities ?? []),
            ...(model.outputModalities ?? []),
            ...model.capabilities,
        ]
            .join(" ")
            .toLowerCase();

        for (const term of parsed.terms) {
            if (!haystack.includes(term)) return false;
        }
    }

    return true;
}
