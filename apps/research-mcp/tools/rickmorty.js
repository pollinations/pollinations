import { z } from "zod";
import { fetchJson } from "../fetch.js";

const API_ROOT = "https://rickandmortyapi.com/api";
// The caller's Pollinations key authenticates the proxy. The Rick and Morty
// API is public, so the key is never forwarded upstream.

function characterSummary(character) {
    return {
        id: character.id ?? null,
        name: character.name ?? null,
        status: character.status ?? null,
        species: character.species ?? null,
        type: character.type || null,
        gender: character.gender ?? null,
        origin: character.origin?.name ?? null,
        location: character.location?.name ?? null,
        episodes: Array.isArray(character.episode)
            ? character.episode.length
            : null,
        image: character.image ?? null,
        url: character.url ?? null,
    };
}

export const rickMortyTools = [
    [
        "rickmorty_character",
        "Look up a Rick and Morty character by name or by character id: status, species, gender, origin, current location and episode count. Covers the Rick and Morty show only — a single-franchise reference, not a general TV database.",
        {
            name: z
                .string()
                .min(1)
                .max(100)
                .optional()
                .describe(
                    "Character name to search for, for example Rick Sanchez. Provide either name or id, not both.",
                ),
            id: z
                .number()
                .int()
                .positive()
                .optional()
                .describe(
                    "Character id, for example 1 for Rick Sanchez. Provide either name or id, not both.",
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
            if (id !== undefined) {
                const data = await fetchJson(`${API_ROOT}/character/${id}`);
                return { character: characterSummary(data) };
            }
            if (name !== undefined) {
                const url = new URL(`${API_ROOT}/character/`);
                url.searchParams.set("name", name);
                let data;
                try {
                    data = await fetchJson(url);
                } catch (error) {
                    // The API answers 404 when a name matches nothing.
                    if (error.message.includes("HTTP 404")) {
                        return { name, total: 0, characters: [] };
                    }
                    throw error;
                }
                return {
                    name,
                    total: data.info?.count ?? 0,
                    characters: (data.results ?? [])
                        .slice(0, limit)
                        .map(characterSummary),
                };
            }
            throw new Error("Provide a character name or id.");
        },
    ],
];
