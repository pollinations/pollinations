// xkcd webcomic lookup. No key; the JSON endpoint is public.
import { z } from "zod";
import { fetchJson } from "../fetch.js";

const API_ROOT = "https://xkcd.com";

function toComic(payload) {
    if (!payload || typeof payload.num !== "number")
        throw new Error("xkcd did not return a comic.");
    const month = String(payload.month ?? "").padStart(2, "0");
    const day = String(payload.day ?? "").padStart(2, "0");
    return {
        number: payload.num,
        title: payload.title ?? null,
        alt: payload.alt ?? null,
        image_url: payload.img ?? null,
        date:
            payload.year && month && day
                ? `${payload.year}-${month}-${day}`
                : null,
        link: payload.link || null,
    };
}

export const xkcdTools = [
    [
        "xkcd",
        "Fetch an xkcd comic by number, or the latest comic when no number is given. Returns the comic number, title, alt text, image URL and publish date. Novelty reference only — the image URL is returned, the image itself is never fetched.",
        {
            number: z
                .number()
                .int()
                .min(1)
                .optional()
                .describe(
                    "Comic number, for example 1 for the first comic. Omit for the latest comic.",
                ),
        },
        async ({ number }) => {
            const url = number
                ? `${API_ROOT}/${number}/info.0.json`
                : `${API_ROOT}/info.0.json`;
            return toComic(await fetchJson(url));
        },
    ],
];
