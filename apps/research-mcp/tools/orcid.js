import { z } from "zod";

const API_ROOT = "https://pub.orcid.org/v3.0";
const MAX_AFFILIATIONS = 3;

function formatResearcher(item) {
    const given = item["given-names"] || "";
    const family = item["family-names"] || "";
    const name =
        item["credit-name"] ||
        [given, family].filter(Boolean).join(" ") ||
        null;
    // institution-name can run to dozens of entries (one live record listed
    // 54); keep the first few so the result stays small.
    const affiliations = [...new Set(item["institution-name"] || [])].slice(
        0,
        MAX_AFFILIATIONS,
    );
    return {
        orcid: item["orcid-id"],
        name,
        affiliations,
        url: `https://orcid.org/${item["orcid-id"]}`,
    };
}

async function worksCount(orcid, fetchJson) {
    try {
        const data = await fetchJson(`${API_ROOT}/${orcid}/works`);
        return Array.isArray(data?.group) ? data.group.length : null;
    } catch {
        // A prolific record can exceed the fetch cap; a missing count must
        // not fail the whole search.
        return null;
    }
}

export const orcidTools = [
    [
        "orcid_search",
        "Search ORCID, the researcher registry, by name — find a researcher's ORCID iD, name, affiliations and profile. A researcher directory, not a paper search: it finds people, not publications.",
        {
            query: z
                .string()
                .trim()
                .min(1)
                .max(200)
                .describe(
                    "Researcher name or keywords, e.g. 'Albert Einstein'",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe(
                    "Maximum number of researchers to return (1-10, default 5)",
                ),
            include_works_count: z
                .boolean()
                .default(false)
                .describe(
                    "Also fetch each researcher's works count (one extra request per result; null when unavailable)",
                ),
        },
        async ({ query, limit, include_works_count }, fetchJson) => {
            // The plain search endpoint returns identifiers only, so use
            // expanded-search, which returns names and institutions in one
            // call. The default row count is 1000 (~117 KB for a common
            // name), so rows is always set explicitly.
            const data = await fetchJson(
                `${API_ROOT}/expanded-search/?q=${encodeURIComponent(query)}&rows=${limit}`,
            );
            const researchers = (data?.["expanded-result"] || []).map(
                formatResearcher,
            );
            if (include_works_count) {
                const counts = await Promise.all(
                    researchers.map((r) => worksCount(r.orcid, fetchJson)),
                );
                researchers.forEach((r, i) => {
                    r.worksCount = counts[i];
                });
            }
            return {
                totalResults: data?.["num-found"] ?? researchers.length,
                query,
                researchers,
            };
        },
    ],
];
