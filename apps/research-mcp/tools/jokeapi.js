import { z } from "zod";
import { fetchJson } from "../fetch.js";

// JokeAPI categories, verified live against /categories on 2026-11-18:
// Any, Misc, Programming, Dark, Pun, Spooky, Christmas. The API is
// case-insensitive about them, so the handler normalizes before validating.
const CATEGORIES = [
    "Any",
    "Misc",
    "Programming",
    "Dark",
    "Pun",
    "Spooky",
    "Christmas",
];

function normalizeCategory(raw) {
    const found = CATEGORIES.find(
        (c) =>
            c.toLowerCase() ===
            String(raw ?? "")
                .trim()
                .toLowerCase(),
    );
    if (!found)
        throw new Error(
            `Unknown joke category. Use one of: ${CATEGORIES.join(", ")}.`,
        );
    return found;
}

export const jokeapiTools = [
    [
        "joke",
        "Get a random joke from JokeAPI (no key). Optional category: Any, Misc, Programming, Dark, Pun, Spooky or Christmas. Safe mode is always on, so no NSFW, religious, political, racist, sexist or explicit jokes come back. Jokes are returned as published. Novelty tool.",
        {
            category: z
                .enum(CATEGORIES)
                .default("Any")
                .describe(
                    "Joke category, for example Programming or Pun. Defaults to Any.",
                ),
        },
        async ({ category = "Any" }) => {
            const resolved = normalizeCategory(category);
            const url = new URL(
                `https://v2.jokeapi.dev/joke/${resolved}?safe-mode`,
            );
            const data = await fetchJson(url);
            if (data?.error === true)
                throw new Error(
                    `JokeAPI: ${data.message ?? "No matching joke found"}`,
                );
            if (data?.type === "single" && typeof data.joke === "string")
                return {
                    category: data.category ?? resolved,
                    type: "single",
                    joke: data.joke,
                    setup: null,
                    delivery: null,
                    flags: data.flags ?? null,
                    id: data.id ?? null,
                };
            if (
                data?.type === "twopart" &&
                typeof data.setup === "string" &&
                typeof data.delivery === "string"
            )
                return {
                    category: data.category ?? resolved,
                    type: "twopart",
                    joke: `${data.setup} ${data.delivery}`,
                    setup: data.setup,
                    delivery: data.delivery,
                    flags: data.flags ?? null,
                    id: data.id ?? null,
                };
            throw new Error("Invalid JokeAPI response");
        },
    ],
];
