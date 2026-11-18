// Song lyrics lookup. No key; the Lyrics.ovh API is public.
import { z } from "zod";

const API_ROOT = "https://api.lyrics.ovh/v1";

function toLyrics(payload, artist, title) {
    if (
        !payload ||
        typeof payload.lyrics !== "string" ||
        payload.lyrics.length === 0
    )
        throw new Error(`No lyrics found for "${title}" by ${artist}.`);
    return {
        artist,
        title,
        lyrics: payload.lyrics,
        length: payload.lyrics.length,
    };
}

export const lyricsTools = [
    [
        "lyrics",
        "Fetch the lyrics of a song by artist and title from Lyrics.ovh. Returns the lyrics as published, plus their character length. No search — the artist and title must both be given.",
        {
            artist: z
                .string()
                .trim()
                .min(1)
                .max(200)
                .describe("Artist name, for example Coldplay."),
            title: z
                .string()
                .trim()
                .min(1)
                .max(200)
                .describe("Song title, for example Yellow."),
        },
        async ({ artist, title }, fetchJson) => {
            const a = artist?.trim();
            const t = title?.trim();
            if (!a || !t)
                throw new Error("Provide both an artist and a song title.");
            const data = await fetchJson(
                `${API_ROOT}/${encodeURIComponent(a)}/${encodeURIComponent(t)}`,
            );
            return toLyrics(data, a, t);
        },
    ],
];
