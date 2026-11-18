// Deezer music search. No key; the search API is public.
import { z } from "zod";

const API_ROOT = "https://api.deezer.com";

function toTrack(track) {
    if (!track || typeof track.title !== "string")
        throw new Error("Deezer did not return a track.");
    return {
        title: track.title,
        artist: track.artist?.name ?? null,
        album: track.album?.title ?? null,
        duration: typeof track.duration === "number" ? track.duration : null,
        rank: typeof track.rank === "number" ? track.rank : null,
        explicit_lyrics: track.explicit_lyrics === true,
        preview: track.preview ?? null,
        link: track.link ?? null,
    };
}

export const deezerTools = [
    [
        "deezer_search",
        "Search Deezer's streaming catalog for tracks by title, artist or album. Returns the track title, artist, album, duration in seconds, Deezer rank, whether the lyrics are explicit, a 30-second preview URL and the Deezer link. Preview URLs are returned, never fetched.",
        {
            query: z
                .string()
                .trim()
                .min(1)
                .max(200)
                .describe("Search text, for example a song title or artist."),
            limit: z
                .number()
                .int()
                .min(1)
                .max(25)
                .default(5)
                .describe("How many tracks to return, 1-25. Default 5."),
        },
        async ({ query, limit = 5 }, fetchJson) => {
            const trimmed = (query ?? "").trim();
            if (!trimmed) throw new Error("A search query is required.");
            if (!Number.isInteger(limit) || limit < 1 || limit > 25)
                throw new Error("limit must be an integer from 1 to 25.");
            const data = await fetchJson(
                `${API_ROOT}/search?q=${encodeURIComponent(trimmed)}&limit=${limit}`,
            );
            if (!data || !Array.isArray(data.data))
                throw new Error("Deezer did not return search results.");
            return {
                total: typeof data.total === "number" ? data.total : 0,
                tracks: data.data.map(toTrack),
            };
        },
    ],
];
