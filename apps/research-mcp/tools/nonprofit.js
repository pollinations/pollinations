import { z } from "zod";
import { fetchJson } from "../fetch.js";

// ProPublica Nonprofit Explorer API v2, keyless. Data comes from the IRS
// Exempt Organizations Business Master File, via ProPublica.

const API_ROOT =
    "https://projects.propublica.org/nonprofits/api/v2/search.json";

function orgSummary(org) {
    return {
        ein: org.strein ?? (org.ein == null ? null : String(org.ein)),
        name: org.name ?? null,
        sub_name: org.sub_name ?? null,
        city: org.city ?? null,
        state: org.state ?? null,
        ntee_code: org.ntee_code ?? null,
        score: org.score ?? null,
    };
}

export const nonprofitTools = [
    [
        "nonprofit_search",
        "Search US tax-exempt nonprofits by name through the ProPublica Nonprofit Explorer (IRS Business Master File data). Returns matching organizations with EIN, name, city/state, NTEE activity code and relevance score. Search only — it does not return filings or financials.",
        {
            query: z
                .string()
                .min(1)
                .max(200)
                .describe(
                    "Nonprofit name to search for, for example red cross.",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe("Maximum number of organizations to return."),
        },
        async ({ query, limit }) => {
            const trimmed = typeof query === "string" ? query.trim() : "";
            if (!trimmed) throw new Error("query must not be blank.");
            const count =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 5;
            const url = new URL(API_ROOT);
            url.searchParams.set("q", trimmed);
            let data;
            try {
                data = await fetchJson(url);
            } catch (error) {
                // A query with no matches answers HTTP 404 carrying the
                // normal empty-result body, but the shared fetch layer throws
                // before the body is read — so a 404 from this fixed search
                // path means "no matches", not a broken endpoint.
                if (
                    error instanceof Error &&
                    error.message.includes("returned HTTP 404")
                ) {
                    return { query: trimmed, total: 0, organizations: [] };
                }
                throw error;
            }
            if (!Array.isArray(data?.organizations))
                throw new Error("Invalid Nonprofit Explorer search response");
            return {
                query: trimmed,
                total: data.total_results ?? data.organizations.length,
                organizations: data.organizations
                    .filter((org) => org?.name)
                    .slice(0, count)
                    .map(orgSummary),
            };
        },
    ],
];
