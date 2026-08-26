import { getModelCapabilities, getModelDisplayName } from "./model-info.ts";
import type { ModelPrice } from "./types.ts";

export type ModelAccess = "paid" | "quest" | "free";

/** key:value terms parsed out of the free-text query. */
type QueryFilter = {
    key: string;
    value: string;
};

export type ParsedModelQuery = {
    /** Lowercased free-text terms that must all match. */
    text: string[];
    filters: QueryFilter[];
};

const FILTER_KEYS = new Set(["access", "owner", "id", "type", "capability"]);

/**
 * Split a raw query into lowercase free-text terms and `key:value` filters.
 * A `key:value` token is only treated as a filter when `key` is a known
 * filter name; otherwise it stays a text term. Inspired by GitHub search —
 * deliberately no negation, parentheses, or quoted phrases.
 */
export function parseModelQuery(rawQuery: string): ParsedModelQuery {
    const text: string[] = [];
    const filters: QueryFilter[] = [];

    for (const token of rawQuery.split(/\s+/)) {
        if (!token) continue;
        const separator = token.indexOf(":");
        if (
            separator > 0 &&
            separator < token.length - 1 &&
            FILTER_KEYS.has(token.slice(0, separator).toLowerCase())
        ) {
            filters.push({
                key: token.slice(0, separator).toLowerCase(),
                value: token.slice(separator + 1).toLowerCase(),
            });
        } else {
            text.push(token.toLowerCase());
        }
    }

    return { text, filters };
}

function modelAccess(model: ModelPrice): ModelAccess {
    if (model.free) return "free";
    return model.paidOnly ? "paid" : "quest";
}

function matchesFilter(model: ModelPrice, filter: QueryFilter): boolean {
    switch (filter.key) {
        case "access":
            return modelAccess(model) === filter.value;
        case "owner":
            // Community ids are "<github-login>/<model>"; registry models
            // have no owner.
            return model.community && model.name.includes("/")
                ? model.name.slice(0, model.name.indexOf("/")).toLowerCase() ===
                      filter.value
                : false;
        case "id":
            return model.name.toLowerCase() === filter.value;
        case "type":
            return model.type === filter.value;
        case "capability": {
            const capability = filter.value.replaceAll("-", "_");
            return getModelCapabilities(model).some(
                (displayed) => displayed.toLowerCase() === capability,
            );
        }
        default:
            return false;
    }
}

/**
 * True when the model matches every condition of the parsed query:
 * each free-text term must appear in one of the model's searchable
 * fields, and every filter must pass.
 */
export function matchesParsedQuery(
    model: ModelPrice,
    parsed: ParsedModelQuery,
): boolean {
    for (const filter of parsed.filters) {
        if (!matchesFilter(model, filter)) return false;
    }

    if (parsed.text.length === 0) return true;

    const haystack = [
        model.name,
        getModelDisplayName(model) ?? "",
        model.description ?? "",
        model.brand ?? "",
        model.baseModel ?? "",
        ...(model.inputModalities ?? []),
        ...(model.outputModalities ?? []),
        ...getModelCapabilities(model),
    ]
        .join(" ")
        .toLowerCase();

    return parsed.text.every((term) => haystack.includes(term));
}
