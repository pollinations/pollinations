import { z } from "zod";

// Verified live 2026-11-18 against /jokes/categories: the only categories
// the API serves. Anything else 404s upstream, so the handler validates
// against this list before any fetch instead of letting it 404.
const CATEGORIES = [
    "animal",
    "career",
    "celebrity",
    "dev",
    "explicit",
    "fashion",
    "food",
    "history",
    "money",
    "movie",
    "music",
    "political",
    "religion",
    "science",
    "sport",
    "travel",
];

export const chuckNorrisTools = [
    [
        "chuck_norris_joke",
        "Fetch a random Chuck Norris joke, optionally from one category. Random-only — there is no search or lookup by id. Jokes are returned exactly as published, including typos; the 'explicit' category can be crude.",
        {
            category: z
                .string()
                .trim()
                .toLowerCase()
                .optional()
                .describe(
                    `Joke category, one of: ${CATEGORIES.join(", ")}. Omit for any category.`,
                ),
        },
        async ({ category }, fetchJson) => {
            // Validate here too: zod applies only when args go through the
            // MCP server, so a direct handler call would otherwise send an
            // unknown category upstream (HTTP 404).
            const normalized = category?.trim().toLowerCase();
            if (normalized && !CATEGORIES.includes(normalized))
                throw new Error(
                    `Unknown Chuck Norris joke category "${category}". Available categories: ${CATEGORIES.join(", ")}.`,
                );
            const url = new URL("https://api.chucknorris.io/jokes/random");
            if (normalized) url.searchParams.set("category", normalized);
            const data = await fetchJson(url);
            if (!data || typeof data.value !== "string")
                throw new Error("Invalid Chuck Norris API response");
            return {
                id: data.id ?? null,
                joke: data.value,
                categories: Array.isArray(data.categories)
                    ? data.categories
                    : [],
                url: data.url ?? null,
                icon_url: data.icon_url ?? null,
            };
        },
    ],
];
