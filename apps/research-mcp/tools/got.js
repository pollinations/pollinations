import { z } from "zod";
import { fetchJson } from "../fetch.js";

const API_ROOT = "https://anapioficeandfire.com/api";
// The caller's Pollinations key authenticates the proxy. An API of Ice and
// Fire is public, so the key is never forwarded upstream.

const LIST_LIMIT = 10;

function capped(list) {
    const values = Array.isArray(list) ? list : [];
    return { items: values.slice(0, LIST_LIMIT), count: values.length };
}

function idFromUrl(url) {
    if (typeof url !== "string") return null;
    const id = Number(url.split("/").filter(Boolean).pop());
    return Number.isInteger(id) && id > 0 ? id : null;
}

// Characters link out to houses and books by URL. Resolve those in parallel
// (deduplicated per call) so the result carries names, not bare URLs; a
// failed lookup falls back to the URL instead of failing the whole call.
async function resolveNames(urls, cache) {
    const unique = [...new Set((urls ?? []).filter(Boolean))];
    await Promise.allSettled(
        unique
            .filter((url) => !cache.has(url))
            .map(async (url) => {
                try {
                    const data = await fetchJson(url);
                    cache.set(
                        url,
                        typeof data?.name === "string" && data.name
                            ? data.name
                            : url,
                    );
                } catch {
                    cache.set(url, url);
                }
            }),
    );
    return unique.map((url) => cache.get(url) ?? url);
}

async function characterSummary(character, cache) {
    const titles = capped(character.titles);
    const aliases = capped(character.aliases);
    const [allegiances, books, povBooks] = await Promise.all([
        resolveNames(character.allegiances, cache),
        resolveNames(character.books, cache),
        resolveNames(character.povBooks, cache),
    ]);
    return {
        id: idFromUrl(character.url),
        name: character.name || null,
        gender: character.gender || null,
        culture: character.culture || null,
        born: character.born || null,
        died: character.died || null,
        titles: titles.items,
        title_count: titles.count,
        aliases: aliases.items,
        alias_count: aliases.count,
        allegiances,
        books,
        pov_books: povBooks,
        tv_series: Array.isArray(character.tvSeries) ? character.tvSeries : [],
        played_by: Array.isArray(character.playedBy) ? character.playedBy : [],
        url: character.url ?? null,
    };
}

export const gotTools = [
    [
        "got_character",
        "Look up a Game of Thrones / A Song of Ice and Fire character by name or by character id: titles, aliases, allegiances, books, TV seasons and actor. Covers A Song of Ice and Fire characters only — a single-franchise reference, not a general character database. The API is community-run, with no SLA.",
        {
            name: z
                .string()
                .min(1)
                .max(100)
                .optional()
                .describe(
                    "Character name to search for, for example Jon Snow. Provide either name or id, not both.",
                ),
            id: z
                .number()
                .int()
                .positive()
                .optional()
                .describe(
                    "Character id, for example 583 for Jon Snow. Provide either name or id, not both.",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe(
                    "Maximum number of matches to return for a name search.",
                ),
        },
        async ({ name, id, limit = 5 }) => {
            if (name !== undefined && id !== undefined) {
                throw new Error("Provide only one of name or id, not both.");
            }
            const cache = new Map();
            if (id !== undefined) {
                const data = await fetchJson(`${API_ROOT}/characters/${id}`);
                return { character: await characterSummary(data, cache) };
            }
            if (name !== undefined) {
                const trimmed = name.trim();
                if (!trimmed) {
                    throw new Error("Provide a non-empty character name.");
                }
                const url = new URL(`${API_ROOT}/characters`);
                url.searchParams.set("name", trimmed);
                const data = await fetchJson(url);
                const matches = Array.isArray(data) ? data : [];
                return {
                    name: trimmed,
                    total: matches.length,
                    characters: await Promise.all(
                        matches
                            .slice(0, limit)
                            .map((c) => characterSummary(c, cache)),
                    ),
                };
            }
            throw new Error("Provide a character name or id.");
        },
    ],
];
