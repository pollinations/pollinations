import { z } from "zod";

const API_ROOT = "https://api.discogs.com/database/search";

function formatArtist(result) {
    return {
        id: result.id ?? null,
        title: result.title ?? null,
        type: result.type ?? null,
        uri: result.uri ?? null,
        cover_image: result.cover_image || null,
        resource_url: result.resource_url ?? null,
    };
}

export const discogsTools = [
    [
        "discogs_artist",
        "Search Discogs for artists by name and return each match with its id, title, type, page URI, cover image URL, and API resource URL. Unauthenticated requests are limited to 60 per minute; a name with no matches returns an empty list, not an error.",
        {
            query: z
                .string()
                .min(1)
                .max(200)
                .describe("Artist name to search for (e.g. 'beatles')"),
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe(
                    "Maximum number of artists to return (1-10, default 5)",
                ),
        },
        async ({ query, limit }, fetchJson) => {
            const term = String(query ?? "").trim();
            if (!term) throw new Error("Artist name must not be empty.");
            const count =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 5;
            const url = `${API_ROOT}?q=${encodeURIComponent(term)}&type=artist&per_page=${count}`;
            const data = await fetchJson(url);
            if (!Array.isArray(data?.results))
                throw new Error("Discogs returned an unexpected response.");
            return {
                query: term,
                total: data.pagination?.items ?? data.results.length,
                artists: data.results.slice(0, count).map(formatArtist),
            };
        },
    ],
];
