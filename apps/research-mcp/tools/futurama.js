import { z } from "zod";
import { fetchJson } from "../fetch.js";

const API_ROOT = "https://api.sampleapis.com/futurama";
// sampleapis is a community-run sample API with no SLA. The tool surfaces
// upstream failures as clean errors and never retries.

const SAYINGS_LIMIT = 3;

function fullName(name) {
    const parts = [name?.first, name?.middle, name?.last].filter(
        (part) => typeof part === "string" && part.trim(),
    );
    return parts.join(" ") || null;
}

function characterSummary(character) {
    const sayings = Array.isArray(character.sayings) ? character.sayings : [];
    const images = character.images ?? {};
    return {
        id: character.id ?? null,
        name: fullName(character.name),
        gender: character.gender || null,
        species: character.species || null,
        home_planet: character.homePlanet || null,
        occupation: character.occupation || null,
        age: character.age ?? null,
        sayings: sayings.slice(0, SAYINGS_LIMIT),
        sayings_count: sayings.length,
        image:
            typeof images.main === "string" && images.main ? images.main : null,
        head_shot:
            typeof images["head-shot"] === "string" && images["head-shot"]
                ? images["head-shot"]
                : null,
        url: `${API_ROOT}/characters/${character.id}`,
    };
}

export const futuramaTools = [
    [
        "futurama_character",
        "Look up a Futurama character by name or by character id: species, home planet, occupation, age and a few sayings. Covers Futurama characters only — a single-franchise reference, not a general character database. The API is a community-run sample API with no SLA.",
        {
            name: z
                .string()
                .min(1)
                .max(100)
                .optional()
                .describe(
                    "Character name to search for, for example Fry. Provide either name or id, not both.",
                ),
            id: z
                .number()
                .int()
                .positive()
                .optional()
                .describe(
                    "Character id, for example 1 for Fry. Provide either name or id, not both.",
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
            if (limit < 1 || limit > 10) {
                throw new Error("limit must be between 1 and 10.");
            }
            if (id !== undefined) {
                const data = await fetchJson(`${API_ROOT}/characters/${id}`);
                return { character: characterSummary(data) };
            }
            if (name !== undefined) {
                const trimmed = name.trim();
                if (!trimmed) {
                    throw new Error("Provide a non-empty character name.");
                }
                // The API has no name-search parameter (?name= answers an
                // empty list), so a name search fetches the full character
                // list — 16 records, about 24 KB — and filters locally.
                const data = await fetchJson(`${API_ROOT}/characters`);
                const list = Array.isArray(data) ? data : [];
                const needle = trimmed.toLowerCase();
                const matches = list.filter((character) =>
                    (fullName(character.name) ?? "")
                        .toLowerCase()
                        .includes(needle),
                );
                return {
                    name: trimmed,
                    total: matches.length,
                    characters: matches
                        .slice(0, limit)
                        .map((character) => characterSummary(character)),
                };
            }
            throw new Error("Provide a character name or id.");
        },
    ],
];
