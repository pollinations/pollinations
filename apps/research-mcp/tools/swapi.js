import { z } from "zod";
import { fetchJson } from "../fetch.js";

const API_ROOT = "https://swapi.dev/api";
// The caller's Pollinations key authenticates the proxy. SWAPI is public,
// so the key is never forwarded upstream.

// Characters link out to their homeworld and films by URL. Resolve those
// in parallel (deduplicated per call) so the result carries names and
// titles, not bare URLs; a failed lookup falls back to the URL instead of
// failing the whole call.
async function resolveLabels(urls, cache, key) {
    const unique = [...new Set((urls ?? []).filter(Boolean))];
    await Promise.allSettled(
        unique
            .filter((url) => !cache.has(url))
            .map(async (url) => {
                try {
                    const data = await fetchJson(url);
                    cache.set(
                        url,
                        typeof data?.[key] === "string" && data[key]
                            ? data[key]
                            : url,
                    );
                } catch {
                    cache.set(url, url);
                }
            }),
    );
    return unique.map((url) => cache.get(url) ?? url);
}

function idFromUrl(url) {
    if (typeof url !== "string") return null;
    const id = Number(url.split("/").filter(Boolean).pop());
    return Number.isInteger(id) && id > 0 ? id : null;
}

async function characterSummary(character, cache) {
    const [homeworld, films] = await Promise.all([
        resolveLabels(
            character.homeworld ? [character.homeworld] : [],
            cache,
            "name",
        ),
        resolveLabels(character.films, cache, "title"),
    ]);
    return {
        id: idFromUrl(character.url),
        name: character.name || null,
        height: character.height || null,
        mass: character.mass || null,
        hair_color: character.hair_color || null,
        skin_color: character.skin_color || null,
        eye_color: character.eye_color || null,
        birth_year: character.birth_year || null,
        gender: character.gender || null,
        homeworld: homeworld[0] ?? null,
        films,
        url: character.url ?? null,
    };
}

export const swapiTools = [
    [
        "swapi_character",
        "Look up a Star Wars character by name or by character id: height, mass, hair/skin/eye color, birth year, gender, homeworld and films. Covers Star Wars characters only — a single-franchise reference, not a general character database. The API is community-run, with no SLA.",
        {
            name: z
                .string()
                .min(1)
                .max(100)
                .optional()
                .describe(
                    "Character name to search for, for example Luke Skywalker. Provide either name or id, not both.",
                ),
            id: z
                .number()
                .int()
                .positive()
                .optional()
                .describe(
                    "Character id, for example 1 for Luke Skywalker. Provide either name or id, not both.",
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
                const data = await fetchJson(`${API_ROOT}/people/${id}/`);
                return { character: await characterSummary(data, cache) };
            }
            if (name !== undefined) {
                const trimmed = name.trim();
                if (!trimmed) {
                    throw new Error("Provide a non-empty character name.");
                }
                const url = new URL(`${API_ROOT}/people/`);
                url.searchParams.set("search", trimmed);
                const data = await fetchJson(url);
                const matches = Array.isArray(data.results) ? data.results : [];
                return {
                    name: trimmed,
                    total: data.count ?? matches.length,
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
