import { z } from "zod";

// The Met Collection API: search moved to v1.1 on 2026-10-01 (v1 search
// returns 410), but object detail still lives on v1 — v1.1 has no object
// endpoint (it 404s). So search goes to v1.1, details to v1.
const SEARCH_ROOT =
    "https://collectionapi.metmuseum.org/public/collection/v1.1/search";
const OBJECT_ROOT =
    "https://collectionapi.metmuseum.org/public/collection/v1/objects";

// Search returns IDs only, so each result costs a second call. Cap the
// detail fetch at the search limit (max 10).
function formatObject(object) {
    return {
        objectId: object.objectID ?? null,
        title: object.title ?? null,
        artist: object.artistDisplayName ?? null,
        date: object.objectDate ?? null,
        medium: object.medium ?? null,
        department: object.department ?? null,
        image: object.primaryImage || null,
        url: object.objectURL ?? null,
    };
}

export const metMuseumTools = [
    [
        "met_search",
        "Search the Metropolitan Museum of Art collection by keyword, returning the matching objects with title, artist, date, medium, department, and image.",
        {
            query: z
                .string()
                .min(1)
                .max(500)
                .describe(
                    "Search query (object title, artist name, or keywords)",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe(
                    "Maximum number of objects to return (1-10, default 5)",
                ),
            is_highlight: z
                .boolean()
                .default(false)
                .describe(
                    "Only return highlighted works from the Met's collection.",
                ),
        },
        async ({ query, limit, is_highlight }, fetchJson) => {
            const url = new URL(SEARCH_ROOT);
            url.searchParams.set("q", query.trim());
            url.searchParams.set("isHighlight", String(is_highlight));
            url.searchParams.set("limit", String(limit));
            const data = await fetchJson(url);
            const ids = Array.isArray(data?.objectIDs)
                ? data.objectIDs.slice(0, limit)
                : [];
            const details = await Promise.all(
                ids.map((id) =>
                    fetchJson(`${OBJECT_ROOT}/${id}`).catch(() => null),
                ),
            );
            return {
                totalResults: data?.total ?? ids.length,
                query: query.trim(),
                results: details
                    .filter((object) => object !== null)
                    .map(formatObject),
            };
        },
    ],
    [
        "met_object",
        "Retrieve details for one object in the Metropolitan Museum of Art collection by its object ID: title, artist, date, medium, department, and image.",
        {
            object_id: z
                .number()
                .int()
                .positive()
                .describe(
                    "Met object ID (e.g. 485308 for Joan Mitchell's Sunflower)",
                ),
        },
        async ({ object_id }, fetchJson) => {
            const object = await fetchJson(`${OBJECT_ROOT}/${object_id}`);
            return { object: formatObject(object) };
        },
    ],
];
