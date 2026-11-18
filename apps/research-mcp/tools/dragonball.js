import { z } from "zod";

const API_ROOT = "https://dragonball-api.com/api/characters";
const DESCRIPTION_LIMIT = 500;

function formatCharacter(item) {
    const description = item.description ? String(item.description) : null;
    return {
        id: item.id ?? null,
        name: item.name ?? null,
        race: item.race ?? null,
        gender: item.gender ?? null,
        ki: item.ki ?? null,
        maxKi: item.maxKi ?? null,
        affiliation: item.affiliation ?? null,
        description: description
            ? description.slice(0, DESCRIPTION_LIMIT)
            : null,
        descriptionTruncated: description
            ? description.length > DESCRIPTION_LIMIT
            : false,
        image_url: item.image ?? null,
    };
}

export const dragonBallTools = [
    [
        "dragonball_character",
        "Search Dragon Ball characters by name. Returns race, ki, maxKi, affiliation and a description — descriptions are in Spanish as published by the API, returned as-is. Name matching is a substring search; image URLs are returned, never fetched.",
        {
            name: z
                .string()
                .min(1)
                .max(200)
                .describe("Character name to search for (substring match)"),
            limit: z
                .number()
                .int()
                .min(1)
                .max(25)
                .default(5)
                .describe(
                    "Maximum number of characters to return (1-25, default 5)",
                ),
        },
        async ({ name, limit }, fetchJson) => {
            const query = (name ?? "").trim();
            if (!query)
                throw new Error("Provide a character name to search for.");
            const take = limit ?? 5;
            if (!Number.isInteger(take) || take < 1 || take > 25)
                throw new Error("limit must be between 1 and 25");
            // The API silently ignores the limit param (name=a&limit=2 returns
            // all 38 matches), so it is never sent — slice client-side instead.
            const data = await fetchJson(
                `${API_ROOT}?name=${encodeURIComponent(query)}`,
            );
            if (!Array.isArray(data))
                throw new Error("Unexpected Dragon Ball API response.");
            return {
                name: query,
                total: data.length,
                characters: data.slice(0, take).map(formatCharacter),
            };
        },
    ],
];
