import { z } from "zod";

const API_ROOT = "https://api.unpaywall.org/v2";
// Contact address Unpaywall requires on every request — example.com addresses
// are rejected with 422. Pollinations' own public support contact; the
// maintainer can configure a different contact address at deploy time.
const CONTACT_EMAIL = "hello@pollinations.ai";

function formatLocation(location) {
    if (!location) return null;
    return {
        url: location.url_for_pdf || location.url || null,
        landing_page_url: location.url_for_landing_page || null,
        version: location.version ?? null,
        license: location.license ?? null,
        host_type: location.host_type ?? null,
    };
}

export const unpaywallTools = [
    [
        "unpaywall_lookup",
        "Find a free legal open-access copy of a scholarly publication by DOI, including the best PDF URL, version and license.",
        {
            doi: z
                .string()
                .min(1)
                .max(200)
                .describe(
                    "Digital Object Identifier (e.g. '10.1038/nature12373')",
                ),
        },
        async ({ doi }, fetchJson) => {
            const normalizedDoi = doi
                .trim()
                .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "");
            const url = `${API_ROOT}/${encodeURIComponent(normalizedDoi)}?email=${encodeURIComponent(CONTACT_EMAIL)}`;
            const data = await fetchJson(url);
            return {
                doi: data.doi ?? normalizedDoi,
                title: data.title ?? null,
                is_oa: data.is_oa ?? false,
                oa_status: data.oa_status ?? null,
                best_oa_location: formatLocation(data.best_oa_location),
            };
        },
    ],
];
