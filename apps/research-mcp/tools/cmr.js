import { z } from "zod";

const API_ROOT = "https://cmr.earthdata.nasa.gov/search/granules.json";
const SHORT_NAME_PATTERN = /^[A-Za-z0-9_.-]+$/;
const VERSION_PATTERN = /^[A-Za-z0-9_.-]+$/;
const DEFAULT_LIMIT = 5;

// NASA CMR returns one ~5 KB entry per granule, so the projection below is
// load-bearing: only the granule id, time range, cloud cover and dataset
// title come back, never the orbit/spatial domains or link lists.
function formatGranule(entry) {
    return {
        granule_id: entry.producer_granule_id ?? entry.id ?? null,
        time_start: entry.time_start ?? null,
        time_end: entry.time_end ?? null,
        cloud_cover: entry.cloud_cover ?? null,
        dataset: entry.dataset_id ?? null,
    };
}

function validateInput({ short_name, version, limit }) {
    const name = typeof short_name === "string" ? short_name.trim() : "";
    if (
        name.length < 1 ||
        name.length > 100 ||
        !SHORT_NAME_PATTERN.test(name)
    ) {
        throw new Error(
            "Use a CMR collection short name (letters, digits, dots, dashes, underscores), e.g. 'MOD09GA'.",
        );
    }
    const ver = typeof version === "string" ? version.trim() : "";
    if (ver.length < 1 || ver.length > 20 || !VERSION_PATTERN.test(ver)) {
        throw new Error(
            "Use a collection version (letters, digits, dots, dashes, underscores), e.g. '061'.",
        );
    }
    // Zod rejects out-of-range limits at the MCP layer; a direct handler
    // call falls back to the default instead of failing.
    const n =
        Number.isInteger(limit) && limit >= 1 && limit <= 10
            ? limit
            : DEFAULT_LIMIT;
    return { name, ver, n };
}

export const cmrTools = [
    [
        "cmr_granule",
        "List granules (data files) for a NASA Earthdata collection from the Common Metadata Repository (CMR) by collection short name and version, e.g. MOD09GA version 061. Returns granule id, time range, cloud cover and dataset title. The version must match a real collection version — a wrong version answers with an empty list, not an error.",
        {
            short_name: z
                .string()
                .min(1)
                .max(100)
                .describe("CMR collection short name, e.g. 'MOD09GA'"),
            version: z
                .string()
                .min(1)
                .max(20)
                .describe(
                    "Collection version, e.g. '061' (must match a real version for the collection)",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe(
                    "Maximum number of granules to return (1-10, default 5)",
                ),
        },
        async ({ short_name, version, limit }, fetchJson) => {
            const { name, ver, n } = validateInput({
                short_name,
                version,
                limit,
            });
            const url =
                `${API_ROOT}?short_name=${encodeURIComponent(name)}` +
                `&version=${encodeURIComponent(ver)}&page_size=${n}`;
            const data = await fetchJson(url);
            if (!data || typeof data !== "object" || !data.feed) {
                throw new Error("CMR returned an unexpected response.");
            }
            const entries = Array.isArray(data.feed.entry)
                ? data.feed.entry
                : [];
            return {
                short_name: name,
                version: ver,
                total: entries.length,
                granules: entries.map(formatGranule),
            };
        },
    ],
];
