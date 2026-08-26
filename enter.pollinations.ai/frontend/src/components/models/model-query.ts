import { getModelCapabilities, getModelDisplayName } from "./model-info.ts";
import type { ModelPrice } from "./types.ts";

export type ModelAccess = "paid" | "quest" | "free";

export type ModelQueryFilter =
    | { key: "access"; value: ModelAccess }
    | {
          key: "owner" | "id" | "type" | "capability";
          value: string;
      };

export type ParsedModelQuery = {
    terms: string[];
    filters: ModelQueryFilter[];
};

const ACCESS_VALUES: readonly ModelAccess[] = ["paid", "quest", "free"];

const isModelAccess = (value: string): value is ModelAccess =>
    ACCESS_VALUES.includes(value as ModelAccess);

/**
 * Split a query into free-text terms and supported `key:value` filters.
 * Unsupported or incomplete filters remain text so existing searches keep
 * their literal meaning. Quoting and other full query-language features are
 * intentionally out of scope.
 */
export function parseModelQuery(query: string): ParsedModelQuery {
    const terms: string[] = [];
    const filters: ModelQueryFilter[] = [];

    for (const token of query.split(/\s+/)) {
        if (!token) continue;

        const separator = token.indexOf(":");
        if (separator <= 0 || separator === token.length - 1) {
            terms.push(token.toLowerCase());
            continue;
        }

        const key = token.slice(0, separator).toLowerCase();
        const value = token.slice(separator + 1).toLowerCase();

        switch (key) {
            case "access":
                if (isModelAccess(value)) {
                    filters.push({ key, value });
                } else {
                    terms.push(token.toLowerCase());
                }
                break;
            case "owner":
            case "id":
            case "type":
            case "capability":
                filters.push({ key, value });
                break;
            default:
                terms.push(token.toLowerCase());
        }
    }

    return { terms, filters };
}

function getModelAccess(model: ModelPrice): ModelAccess {
    if (model.free) return "free";
    return model.paidOnly ? "paid" : "quest";
}

const normalizeCapability = (value: string): string =>
    value.toLowerCase().replaceAll("-", "_");

function getSearchableCapabilities(model: ModelPrice): string[] {
    return [...model.capabilities, ...getModelCapabilities(model)].map(
        normalizeCapability,
    );
}

function matchesFilter(model: ModelPrice, filter: ModelQueryFilter): boolean {
    switch (filter.key) {
        case "access":
            return getModelAccess(model) === filter.value;
        case "owner": {
            if (!model.community) return false;
            const separator = model.name.indexOf("/");
            return (
                separator > 0 &&
                model.name.slice(0, separator).toLowerCase() === filter.value
            );
        }
        case "id":
            return model.name.toLowerCase() === filter.value;
        case "type":
            return (model.agent ? "agent" : model.type) === filter.value;
        case "capability":
            return getSearchableCapabilities(model).includes(
                normalizeCapability(filter.value),
            );
    }
}

function getSearchableText(model: ModelPrice): string {
    return [
        model.name,
        getModelDisplayName(model),
        model.description,
        model.brand,
        model.baseModel,
        ...(model.inputModalities ?? []),
        ...(model.outputModalities ?? []),
        ...getSearchableCapabilities(model),
    ]
        .filter((value): value is string => Boolean(value))
        .join(" ")
        .toLowerCase();
}

/** Match only when every free-text term and every filter applies. */
export function matchesModelQuery(
    model: ModelPrice,
    query: ParsedModelQuery,
): boolean {
    if (!query.filters.every((filter) => matchesFilter(model, filter))) {
        return false;
    }
    if (query.terms.length === 0) return true;

    const searchableText = getSearchableText(model);
    return query.terms.every((term) => searchableText.includes(term));
}

const MODEL_QUERY_FILTER_KEYS = [
    "access",
    "owner",
    "id",
    "type",
    "capability",
] as const;

const MAX_MODEL_QUERY_SUGGESTIONS = 20;

function getFilterValueCandidates(key: string, models: ModelPrice[]): string[] {
    switch (key) {
        case "access":
            return [...ACCESS_VALUES];
        case "type": {
            const values = new Set(
                models.map((model) => (model.agent ? "agent" : model.type)),
            );
            return [...values].sort();
        }
        case "capability": {
            const values = new Set(
                models
                    .flatMap(getSearchableCapabilities)
                    .map((value) => value.replaceAll("_", "-")),
            );
            return [...values].sort();
        }
        case "owner": {
            const values = new Set(
                models
                    .filter((model) => model.community)
                    .map((model) =>
                        model.name.slice(0, model.name.indexOf("/")),
                    )
                    .filter(Boolean)
                    .map((owner) => owner.toLowerCase()),
            );
            return [...values].sort();
        }
        case "id":
            return models.map((model) => model.name.toLowerCase());
        default:
            return [];
    }
}

/**
 * Suggest completions for the token currently being typed: filter keys when
 * it has no `key:` prefix yet, or matching values once one is present.
 */
export function getModelQuerySuggestions(
    token: string,
    models: ModelPrice[],
): string[] {
    const separator = token.indexOf(":");
    if (separator === -1) {
        const prefix = token.toLowerCase();
        return MODEL_QUERY_FILTER_KEYS.filter((key) =>
            key.startsWith(prefix),
        ).map((key) => `${key}:`);
    }

    const key = token.slice(0, separator).toLowerCase();
    const valuePrefix = token.slice(separator + 1).toLowerCase();
    return getFilterValueCandidates(key, models)
        .filter((value) => value.startsWith(valuePrefix))
        .map((value) => `${key}:${value}`)
        .slice(0, MAX_MODEL_QUERY_SUGGESTIONS);
}
