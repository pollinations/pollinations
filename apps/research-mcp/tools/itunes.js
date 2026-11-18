import { z } from "zod";
import { fetchJson } from "../fetch.js";

const API_ROOT = "https://itunes.apple.com";

const mediaSchema = z
    .enum([
        "music",
        "movie",
        "podcast",
        "musicVideo",
        "audiobook",
        "shortFilm",
        "tvShow",
        "software",
        "ebook",
        "all",
    ])
    .default("music")
    .describe(
        "Kind of media to search for, for example music, podcast or movie.",
    );

function projectResult(item) {
    return {
        kind: item.kind ?? item.wrapperType ?? null,
        track: item.trackName ?? null,
        artist: item.artistName ?? null,
        collection: item.collectionName ?? null,
        genre: item.primaryGenreName ?? null,
        price: item.trackPrice ?? item.collectionPrice ?? null,
        currency: item.currency ?? null,
        releaseDate: item.releaseDate ?? null,
        previewUrl: item.previewUrl ?? null,
        url: item.trackViewUrl ?? item.collectionViewUrl ?? null,
    };
}

export const itunesTools = [
    [
        "itunes_search",
        "Search the iTunes Store for music, podcasts, movies and more (no key). Returns track, artist, collection, genre, price and a preview URL. Preview URLs are 30-second audio previews, not full tracks.",
        {
            term: z
                .string()
                .min(1)
                .max(200)
                .describe(
                    "Search term, for example an artist, track, album or podcast name.",
                ),
            media: mediaSchema,
            limit: z
                .number()
                .int()
                .min(1)
                .max(25)
                .default(5)
                .describe("Maximum number of results."),
        },
        async ({ term, media = "music", limit = 5 }) => {
            const trimmed = term.trim();
            if (trimmed.length === 0)
                throw new Error("Search term must not be empty.");
            const url = new URL(`${API_ROOT}/search`);
            url.search = new URLSearchParams({
                term: trimmed,
                media,
                limit: String(limit),
            }).toString();
            const data = await fetchJson(url);
            if (!Array.isArray(data?.results))
                throw new Error("Invalid iTunes search response.");
            return {
                term: trimmed,
                media,
                total: data.resultCount ?? data.results.length,
                results: data.results.map(projectResult),
            };
        },
    ],
];
