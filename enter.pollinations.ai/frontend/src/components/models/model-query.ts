import { getModelCapabilities, getModelDisplayName } from "./model-info.ts";
import type { ModelPrice } from "./types.ts";

export type ModelAccess = "paid" | "quest" | "free";
export type ModelSource = "official" | "community";

export type ModelQueryFilter =
    | { key: "access"; value: ModelAccess }
    | { key: "source"; value: ModelSource }
    | {
          key: "publisher" | "id" | "type" | "capability";
          value: string;
      };
export type ModelQueryFilterKey = ModelQueryFilter["key"];

export type ParsedModelQuery = {
    terms: string[];
    filters: ModelQueryFilter[];
};

export type ModelQueryFilterToken = {
    filter: ModelQueryFilter;
    index: number;
    token: string;
};

export type ModelQueryDraftFilter = {
    index: number;
    key: ModelQueryFilterKey;
    token: string;
    value: string;
};

const ACCESS_VALUES: readonly ModelAccess[] = ["paid", "quest", "free"];
const SOURCE_VALUES: readonly ModelSource[] = ["official", "community"];
const FILTER_KEYS = [
    "access",
    "source",
    "publisher",
    "id",
    "type",
    "capability",
] as const;

const isModelQueryFilterKey = (value: string): value is ModelQueryFilterKey =>
    FILTER_KEYS.includes(value as ModelQueryFilterKey);

const isModelAccess = (value: string): value is ModelAccess =>
    ACCESS_VALUES.includes(value as ModelAccess);

const isModelSource = (value: string): value is ModelSource =>
    SOURCE_VALUES.includes(value as ModelSource);

function parseModelQueryFilter(token: string): ModelQueryFilter | undefined {
    const separator = token.indexOf(":");
    if (separator <= 0 || separator === token.length - 1) return undefined;

    const key = token.slice(0, separator).toLowerCase();
    const value = token.slice(separator + 1).toLowerCase();

    switch (key) {
        case "access":
            return isModelAccess(value) ? { key, value } : undefined;
        case "source":
            return isModelSource(value) ? { key, value } : undefined;
        case "publisher":
        case "id":
        case "type":
        case "capability":
            return { key, value };
        default:
            return undefined;
    }
}

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

        const filter = parseModelQueryFilter(token);
        if (filter) {
            filters.push(filter);
        } else {
            terms.push(token.toLowerCase());
        }
    }

    return { terms, filters };
}

/** The Models tab defaults to official models until the query selects a source. */
export function getModelQuerySource(query: ParsedModelQuery): ModelSource {
    return (
        query.filters.find((filter) => filter.key === "source")?.value ??
        "official"
    );
}

export function getExplicitModelQuerySource(
    query: ParsedModelQuery,
): ModelSource | undefined {
    return query.filters.find((filter) => filter.key === "source")?.value;
}

/** Ensure model catalog queries always show their selected source scope. */
export function ensureModelQuerySource(query: string): string {
    const normalizedQuery = query.trim();
    return getExplicitModelQuerySource(parseModelQuery(normalizedQuery))
        ? normalizedQuery
        : ["source:official", normalizedQuery].filter(Boolean).join(" ");
}

/** Return completed filter tokens in their query order. */
export function getModelQueryFilterTokens(
    query: string,
): ModelQueryFilterToken[] {
    return query
        .split(/\s+/)
        .filter(Boolean)
        .map((token, index) => ({
            filter: parseModelQueryFilter(token),
            index,
            token,
        }))
        .filter(
            (
                entry,
            ): entry is ModelQueryFilterToken & {
                filter: ModelQueryFilter;
            } => Boolean(entry.filter),
        );
}

/** Return the final filter token while its value is being entered. */
export function getModelQueryDraftFilter(
    query: string,
    includeCompleted = false,
): ModelQueryDraftFilter | undefined {
    const tokens = query.split(/\s+/).filter(Boolean);
    const index = tokens.length - 1;
    const token = tokens[index];
    if (!token) return undefined;

    const separator = token.indexOf(":");
    if (separator <= 0) return undefined;

    const key = token.slice(0, separator).toLowerCase();
    if (!isModelQueryFilterKey(key)) return undefined;
    if (!includeCompleted && parseModelQueryFilter(token)) return undefined;

    return {
        index,
        key,
        token,
        value: token.slice(separator + 1),
    };
}

/** Remove one completed filter while retaining every other query token. */
export function removeModelQueryFilterToken(
    query: string,
    index: number,
): string {
    return query
        .split(/\s+/)
        .filter(Boolean)
        .filter((_token, tokenIndex) => tokenIndex !== index)
        .join(" ");
}

/** Replace one completed filter while retaining every other query token. */
export function replaceModelQueryFilterToken(
    query: string,
    index: number,
    filter: ModelQueryFilter,
): string {
    return query
        .split(/\s+/)
        .filter(Boolean)
        .map((token, tokenIndex) =>
            tokenIndex === index ? `${filter.key}:${filter.value}` : token,
        )
        .join(" ");
}

/** Remove source tokens from the text rendered beside the source filter pill. */
export function removeModelQuerySource(query: string): string {
    return query
        .split(/\s+/)
        .filter(
            (token) => token && parseModelQueryFilter(token)?.key !== "source",
        )
        .join(" ");
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

function getModelPublisher(model: ModelPrice): string | null {
    if (model.community) {
        const separator = model.name.indexOf("/");
        return separator > 0
            ? model.name.slice(0, separator).toLowerCase()
            : null;
    }
    return model.brand?.trim().toLowerCase().replace(/\s+/g, "-") ?? null;
}

function getFilterValues(key: string, models: ModelPrice[]): string[] {
    switch (key) {
        case "access":
            return [...ACCESS_VALUES];
        case "source":
            return [...SOURCE_VALUES];
        case "publisher":
            return models
                .map(getModelPublisher)
                .filter((value): value is string => Boolean(value));
        case "id":
            return models.map((model) => model.name.toLowerCase());
        case "type":
            return models.map((model) => (model.agent ? "agent" : model.type));
        case "capability":
            return models
                .flatMap(getSearchableCapabilities)
                .map((value) => value.replaceAll("_", "-"));
        default:
            return [];
    }
}

/** Complete the filter token currently being typed. */
export function getModelQuerySuggestions(
    query: string,
    models: ModelPrice[],
): string[] {
    const tokenStart = query.lastIndexOf(" ") + 1;
    const prefix = query.slice(0, tokenStart);
    const token = query.slice(tokenStart).toLowerCase();
    const separator = token.indexOf(":");

    const suggestions =
        separator === -1
            ? FILTER_KEYS.filter((key) => key.startsWith(token)).map(
                  (key) => `${key}:`,
              )
            : getFilterValues(token.slice(0, separator), models)
                  .filter((value) =>
                      value.startsWith(token.slice(separator + 1)),
                  )
                  .map((value) => `${token.slice(0, separator)}:${value} `);

    return [...new Set(suggestions)]
        .sort()
        .slice(0, 20)
        .map((suggestion) => `${prefix}${suggestion}`);
}

function matchesFilter(model: ModelPrice, filter: ModelQueryFilter): boolean {
    switch (filter.key) {
        case "access":
            return getModelAccess(model) === filter.value;
        case "source":
            return Boolean(model.community) === (filter.value === "community");
        case "publisher": {
            return getModelPublisher(model) === filter.value;
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
