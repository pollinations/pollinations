import { z } from "zod";

const API_ROOT = "https://ghoapi.azureedge.net/api/Indicator";

// OData string literals escape a single quote by doubling it; without this
// a quote in the term would break the $filter expression.
function escapeOdataLiteral(term) {
    return term.replaceAll("'", "''");
}

function formatIndicator(item) {
    return {
        code: item.IndicatorCode ?? null,
        name: item.IndicatorName ?? null,
    };
}

export const whoTools = [
    [
        "who_indicator",
        "Search the WHO Global Health Observatory indicator catalogue by name and return matching indicators with their code and name. Search only: it answers which indicator a term matches, not the data behind it.",
        {
            query: z
                .string()
                .min(1)
                .max(200)
                .describe(
                    "Term to match against indicator names (e.g. 'malaria')",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe(
                    "Maximum number of indicators to return (1-10, default 5)",
                ),
        },
        async ({ query, limit }, fetchJson) => {
            const term = String(query ?? "").trim();
            if (!term) throw new Error("Search term must not be empty.");
            const count =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 5;
            const url =
                `${API_ROOT}?$filter=contains(IndicatorName,'${escapeOdataLiteral(term)}')` +
                `&$top=${count}&$format=json`;
            const data = await fetchJson(url);
            if (!Array.isArray(data?.value))
                throw new Error(
                    "WHO Global Health Observatory returned an unexpected response.",
                );
            return {
                query: term,
                total: data.value.length,
                indicators: data.value.slice(0, count).map(formatIndicator),
            };
        },
    ],
];
