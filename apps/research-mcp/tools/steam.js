// Steam store search + game details. No key; the Steam store API is public.
// Search and detail only — no reviews endpoint (see the #18102 note below).
import { z } from "zod";

const API_ROOT = "https://store.steampowered.com/api";
const DESCRIPTION_LIMIT = 500;

const ENTITIES = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
};

function decodeEntities(text) {
    return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
        const key = entity.toLowerCase();
        if (key.startsWith("#x")) {
            const code = Number.parseInt(key.slice(2), 16);
            return code <= 0x10ffff ? String.fromCodePoint(code) : match;
        }
        if (key.startsWith("#")) {
            const code = Number.parseInt(key.slice(1), 10);
            return code <= 0x10ffff ? String.fromCodePoint(code) : match;
        }
        return ENTITIES[key] ?? match;
    });
}

// Steam descriptions carry HTML tags and entities (e.g. &quot;). Strip both,
// collapse the whitespace, and cap the length.
function toText(html) {
    if (!html) return { text: null, truncated: false };
    const cleaned = decodeEntities(String(html).replace(/<[^>]+>/g, " "))
        .replace(/\s+/g, " ")
        .trim();
    return {
        text:
            cleaned.length > DESCRIPTION_LIMIT
                ? cleaned.slice(0, DESCRIPTION_LIMIT)
                : cleaned,
        truncated: cleaned.length > DESCRIPTION_LIMIT,
    };
}

function priceFromCents(price) {
    if (!price) return null;
    return {
        currency: price.currency ?? null,
        price_usd: typeof price.final === "number" ? price.final / 100 : null,
        discount_percent: price.discount_percent ?? 0,
    };
}

function gameSummary(item) {
    return {
        id: item.id ?? null,
        name: item.name ?? null,
        type: item.type ?? null,
        price: priceFromCents(item.price),
        metascore:
            item.metascore === undefined || item.metascore === ""
                ? null
                : Number(item.metascore),
        image_url: item.tiny_image ?? null,
    };
}

export const steamTools = [
    [
        "steam_search",
        "Search the Steam store by game name. Returns matching games with their app id, price in USD (null when free) and Metacritic score. Prices are in USD; the tiny image URL is returned, the image itself is never fetched.",
        {
            query: z
                .string()
                .trim()
                .min(1)
                .max(200)
                .describe("Game name to search for, for example Portal 2."),
            limit: z
                .number()
                .int()
                .min(1)
                .max(25)
                .default(5)
                .describe("Maximum number of results to return."),
        },
        async ({ query, limit = 5 }, fetchJson) => {
            const trimmed = String(query ?? "").trim();
            if (!trimmed) throw new Error("Search query must not be empty.");
            if (!Number.isInteger(limit) || limit < 1 || limit > 25)
                throw new Error("limit must be an integer between 1 and 25.");
            const url = `${API_ROOT}/storesearch/?term=${encodeURIComponent(trimmed)}&cc=US&l=en`;
            const data = await fetchJson(url);
            const items = Array.isArray(data?.items) ? data.items : [];
            return {
                query: trimmed,
                total: data?.total ?? items.length,
                games: items.slice(0, limit).map(gameSummary),
            };
        },
    ],
    [
        "steam_game",
        "Read one Steam game's store page by app id: name, type, free/paid price in USD, genres, release date, Metacritic score and a short description. The description is stripped of HTML and capped at 500 characters. Prices are in USD.",
        {
            id: z
                .number()
                .int()
                .min(1)
                .describe("Steam app id, for example 620 for Portal 2."),
        },
        async ({ id }, fetchJson) => {
            if (!Number.isInteger(id) || id < 1)
                throw new Error("App id must be a positive integer.");
            // l=en matters: without it the response comes back in the
            // caller's locale (a probe without it returned French text).
            // Full appdetails on purpose — closed #18102 was rejected
            // partly because its filters=basic request omitted fields the
            // tools advertised, so every field below comes from the full
            // response and nothing else is advertised.
            const data = await fetchJson(
                `${API_ROOT}/appdetails?appids=${id}&l=en`,
            );
            const entry = data?.[String(id)];
            if (!entry?.success || !entry.data)
                throw new Error(`No Steam game found for app id ${id}.`);
            const game = entry.data;
            const description = toText(game.short_description);
            return {
                id,
                name: game.name ?? null,
                type: game.type ?? null,
                is_free: game.is_free === true,
                price: game.is_free
                    ? null
                    : priceFromCents(game.price_overview),
                genres: (game.genres ?? []).map((g) => g.description),
                release_date: game.release_date?.date ?? null,
                metascore: game.metacritic?.score ?? null,
                short_description: description.text,
                short_description_truncated: description.truncated,
                image_url: game.header_image ?? null,
                url: `https://store.steampowered.com/app/${id}/`,
            };
        },
    ],
];
