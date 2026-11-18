import { z } from "zod";

// Kitsu is a community-run anime database (no SLA), no key.
// The filter brackets must be URL-encoded: the unencoded form
// (filter[text]=...) fails from some clients, so the URL below
// spells them out as %5B / %5D rather than building them with
// URLSearchParams (which would also work, but hides the requirement).
// Kitsu is JSON:API and 406s on a plain `Accept: application/json`,
// so the tool requests `application/vnd.api+json` explicitly.
const API_ROOT = "https://kitsu.io/api/edge/anime";
const SYNOPSIS_LIMIT = 500;

function animeSummary(item) {
    const a = item.attributes ?? {};
    const synopsis = a.synopsis ? String(a.synopsis).trim() : null;
    const rating =
        a.averageRating === null || a.averageRating === undefined
            ? null
            : Number.parseFloat(a.averageRating);
    return {
        id: item.id ?? null,
        title: a.canonicalTitle ?? null,
        english_title:
            a.titles?.en && a.titles.en !== a.canonicalTitle
                ? a.titles.en
                : null,
        status: a.status ?? null,
        show_type: a.showType ?? null,
        episode_count: a.episodeCount ?? null,
        episode_length: a.episodeLength ?? null,
        average_rating: Number.isNaN(rating) ? null : rating,
        age_rating: a.ageRating ?? null,
        age_rating_guide: a.ageRatingGuide ?? null,
        nsfw: a.nsfw ?? null,
        start_date: a.startDate ?? null,
        end_date: a.endDate ?? null,
        synopsis:
            synopsis && synopsis.length > SYNOPSIS_LIMIT
                ? `${synopsis.slice(0, SYNOPSIS_LIMIT)}…`
                : synopsis,
        url: a.slug ? `https://kitsu.io/anime/${a.slug}` : null,
    };
}

export const kitsuTools = [
    [
        "kitsu_search",
        "Search anime on Kitsu (community-run anime database, no key): title, status, episode count and length, average rating, age rating, and a short synopsis. Manga is not covered here — use MangaDex for that.",
        {
            title: z
                .string()
                .min(1)
                .max(200)
                .describe(
                    "Anime title to search for, for example naruto or Frieren.",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(25)
                .default(5)
                .describe("Maximum number of results to return."),
        },
        async ({ title, limit = 5 }, fetchJson) => {
            const trimmed = title.trim();
            if (!trimmed) throw new Error("Title must not be empty.");
            const url =
                `${API_ROOT}?filter%5Btext%5D=${encodeURIComponent(trimmed)}` +
                `&page%5Blimit%5D=${limit}`;
            const data = await fetchJson(url, "application/vnd.api+json");
            const items = Array.isArray(data?.data) ? data.data : [];
            return {
                total: data?.meta?.count ?? items.length,
                title: trimmed,
                anime: items.map(animeSummary),
            };
        },
    ],
];
