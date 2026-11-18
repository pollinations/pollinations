import { z } from "zod";

const title = z.string().trim().min(1).max(300);
const limit = z.number().int().min(1).max(10).default(5);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DESCRIPTION_CAP = 500;

// Titles and descriptions are localized objects keyed by language code;
// English is preferred, romanized Japanese next, then whatever is present.
function localizedText(values) {
    if (!values || typeof values !== "object") return null;
    return values.en ?? values["ja-ro"] ?? Object.values(values)[0] ?? null;
}

function projectManga(manga) {
    const attributes = manga.attributes ?? {};
    const description = localizedText(attributes.description);
    return {
        id: manga.id,
        title: localizedText(attributes.title),
        altTitles: (attributes.altTitles ?? [])
            .map((t) => t.en)
            .filter(Boolean)
            .slice(0, 3),
        status: attributes.status ?? null,
        year: attributes.year ?? null,
        contentRating: attributes.contentRating ?? null,
        originalLanguage: attributes.originalLanguage ?? null,
        description: description ? description.slice(0, DESCRIPTION_CAP) : null,
        descriptionTruncated: description
            ? description.length > DESCRIPTION_CAP
            : false,
        tags: (attributes.tags ?? [])
            .map((t) => t.attributes?.name?.en)
            .filter(Boolean)
            .slice(0, 10),
        url: `https://mangadex.org/title/${manga.id}`,
    };
}

export const mangadexTools = [
    [
        "mangadex_search",
        "Search MangaDex for manga by title. Returns the total matches plus id, title, status, year, content rating, description and tags per result. MangaDex search is loose — a query can match titles that merely contain the words — and some titles have no English title, so the title falls back to romanized Japanese. No key; MangaDex asks clients to stay under 5 requests per second.",
        {
            title,
            limit,
        },
        async ({ title, limit = 5 }, fetchJson) => {
            const data = await fetchJson(
                `https://api.mangadex.org/manga?${new URLSearchParams({ title, limit })}`,
            );
            if (data.result !== "ok" || !Array.isArray(data.data))
                throw new Error("Invalid MangaDex search response");
            return {
                total: data.total ?? data.data.length,
                results: data.data.map(projectManga),
            };
        },
    ],
    [
        "mangadex_manga",
        "Fetch one MangaDex manga by its UUID, returning title, status, year, content rating, description and tags. Unknown IDs 404.",
        {
            id: z
                .string()
                .trim()
                .regex(
                    uuid,
                    "Use a MangaDex manga UUID, e.g. 275c3ee8-bdeb-4070-a333-6add23a8415a.",
                ),
        },
        async ({ id }, fetchJson) => {
            const data = await fetchJson(
                `https://api.mangadex.org/manga/${id}`,
            );
            if (data.result !== "ok" || !data.data)
                throw new Error("Invalid MangaDex response");
            return projectManga(data.data);
        },
    ],
];
