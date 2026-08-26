import { isPaidOnly } from "./model-info.ts";
import type { ModelPrice } from "./types.ts";

/** Supported `key:value` filter keys, inspired by GitHub search. */
const FILTER_KEYS = ["access", "owner", "id", "type", "capability"] as const;

export type ModelQueryFilterKey = (typeof FILTER_KEYS)[number];

export type ModelQueryFilter =
    | { key: "access"; value: "paid" | "quest" | "free" }
    | { key: "owner"; value: string }
    | { key: "id"; value: string }
    | { key: "type"; value: string }
    | { key: "capability"; value: string };

export type ParsedModelQuery = {
    terms: string[];
    filters: ModelQueryFilter[];
};

const ACCESS_VALUES = ["paid", "quest", "free"] as const;

type AccessValue = (typeof ACCESS_VALUES)[number];

const isAccessValue = (value: string): value is AccessValue =>
    (ACCESS_VALUES as readonly string[]).includes(value);

const isFilterKey = (key: string): key is ModelQueryFilterKey =>
    (FILTER_KEYS as readonly string[]).includes(key);

/**
 * Splits a raw query into free-text terms and `key:value` filters.
 * Tokens that look like filters but use an unsupported key or an
 * unknown access value stay free-text terms.
 */
export function parseModelQuery(query: string): ParsedModelQuery {
    const terms: string[] = [];
    const filters: ModelQueryFilter[] = [];

    for (const token of query.split(/\s+/)) {
        if (!token) continue;
        const match = /^([a-zA-Z]+):(\S+)$/.exec(token);
        const key = match?.[1]?.toLowerCase();
        if (!match || !key || !isFilterKey(key)) {
            terms.push(token.toLowerCase());
            continue;
        }
        const value = match[2];
        if (key === "access") {
            const access = value.toLowerCase();
            if (isAccessValue(access)) {
                filters.push({ key, value: access });
            } else {
                terms.push(token.toLowerCase());
            }
            continue;
        }
        filters.push({ key, value } as ModelQueryFilter);
    }

    return { terms, filters };
}

function matchesAccess(
    model: ModelPrice,
    access: "paid" | "quest" | "free",
): boolean {
    if (access === "free") return model.free === true;
    if (access === "paid") return isPaidOnly(model);
    // "quest" is everything callable without paying up front.
    return model.free !== true && !isPaidOnly(model);
}

function matchesFilter(model: ModelPrice, filter: ModelQueryFilter): boolean {
    switch (filter.key) {
        case "access":
            return matchesAccess(model, filter.value);
        case "owner": {
            // Community ids are "<github-login>/<model>", so the public
            // owner login is a prefix of the canonical id.
            if (!model.community) return false;
            return model.name
                .toLowerCase()
                .startsWith(`${filter.value.toLowerCase()}/`);
        }
        case "id":
            return model.name.toLowerCase() === filter.value.toLowerCase();
        case "type": {
            const category = model.agent ? "agent" : model.type;
            return category === filter.value.toLowerCase();
        }
        case "capability":
            return model.capabilities.some(
                (capability) => capability === filter.value.toLowerCase(),
            );
    }
}

function queryHaystack(model: ModelPrice): string {
    return [
        model.name,
        model.displayName,
        model.description,
        model.brand,
        model.baseModel,
        ...(model.inputModalities ?? []),
        ...(model.outputModalities ?? []),
        ...model.capabilities,
    ]
        .filter((field) => typeof field === "string" && field.length > 0)
        .join(" ")
        .toLowerCase();
}

/** True when every term and every filter matches the model. */
export function matchesModelQuery(
    model: ModelPrice,
    parsed: ParsedModelQuery,
): boolean {
    if (parsed.terms.length === 0 && parsed.filters.length === 0) return true;
    const haystack = parsed.terms.length > 0 ? queryHaystack(model) : "";
    return (
        parsed.terms.every((term) => haystack.includes(term)) &&
        parsed.filters.every((filter) => matchesFilter(model, filter))
    );
}
