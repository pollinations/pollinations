import { getModelCapabilities, getModelDisplayName } from "./model-info.ts";
import type { ModelPrice } from "./types.ts";

export type ModelAccess = "paid" | "quest" | "free";

export type ModelQueryFilter =
    | { key: "access"; value: ModelAccess }
    | {
          key: "publisher" | "id" | "type" | "capability";
          value: string;
      };

export type ParsedModelQuery = {
    terms: string[];
    filters: ModelQueryFilter[];
};

const ACCESS_VALUES: readonly ModelAccess[] = ["paid", "quest", "free"];
const FILTER_KEYS = [
    "access",
    "publisher",
    "id",
    "type",
    "capability",
] as const;

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
            case "publisher":
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
