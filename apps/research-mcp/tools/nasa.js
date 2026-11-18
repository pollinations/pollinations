// NASA image library search. Keyless, public API.
// The caller's Pollinations key authenticates the proxy; the NASA images API
// is public, so the key is never forwarded upstream.
import { z } from "zod";
import { fetchJson } from "../fetch.js";

const API_ROOT = "https://images-api.nasa.gov/search";
const DESCRIPTION_LIMIT = 500;
const KEYWORD_LIMIT = 5;

function imageSummary(item) {
    const data = item?.data?.[0] ?? {};
    const rawDescription = data.description_508 ?? null;
    const description =
        typeof rawDescription === "string" && rawDescription.length > 0
            ? rawDescription.length > DESCRIPTION_LIMIT
                ? `${rawDescription.slice(0, DESCRIPTION_LIMIT)}…`
                : rawDescription
            : null;
    return {
        title: data.title ?? null,
        nasa_id: data.nasa_id ?? null,
        date_created: data.date_created ?? null,
        description,
        keywords: Array.isArray(data.keywords)
            ? data.keywords.slice(0, KEYWORD_LIMIT)
            : [],
        // The href in a search result is the asset collection, not the image
        // itself; returned as-is so the caller can fetch it, never fetched here.
        asset_collection: item?.href ?? null,
    };
}

export const nasaTools = [
    [
        "nasa_images",
        "Search NASA's image library for photos and imagery from NASA missions. Returns titles, descriptions, dates, keywords, and asset collection links. No key needed.",
        {
            query: z
                .string()
                .trim()
                .min(1)
                .max(200)
                .describe(
                    "Search terms, for example apollo, mars rover, or nebula.",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe("Maximum number of images to return."),
        },
        async ({ query, limit = 5 }) => {
            const trimmed = typeof query === "string" ? query.trim() : "";
            if (!trimmed) throw new Error("Provide a search query.");
            const pageSize = Number.isInteger(limit)
                ? Math.min(10, Math.max(1, limit))
                : 5;
            const url = new URL(API_ROOT);
            url.searchParams.set("q", trimmed);
            url.searchParams.set("media_type", "image");
            url.searchParams.set("page_size", String(pageSize));
            const data = await fetchJson(url);
            const collection = data?.collection;
            if (!collection || !Array.isArray(collection.items))
                throw new Error(
                    "NASA image search returned an unexpected response.",
                );
            return {
                query: trimmed,
                total: collection.metadata?.total_hits ?? 0,
                images: collection.items.slice(0, pageSize).map(imageSummary),
            };
        },
    ],
];
