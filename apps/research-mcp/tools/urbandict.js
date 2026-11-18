import { z } from "zod";

// Urban Dictionary definitions are user-generated content, returned
// exactly as published — including profanity and offensive language.
// The tool does not censor, sanitize or rewrite them; callers should
// treat the text as unmoderated.
const entry = (data) => ({
    definition: data.definition,
    example: data.example,
    thumbs_up: data.thumbs_up,
    thumbs_down: data.thumbs_down,
    author: data.author,
    written_on: data.written_on,
});

export const urbandictTools = [
    [
        "urbandict",
        "Look up slang definitions on Urban Dictionary by term. Returns the top definitions exactly as published — user-generated content, including profanity; nothing is censored or rewritten. Each entry carries the definition, example, thumbs up/down, author and date written.",
        {
            term: z.string().trim().min(1).max(100),
            limit: z.number().int().min(1).max(5).default(1),
        },
        async ({ term, limit = 1 }, fetchJson) => {
            // Zod trims and validates only when args go through the MCP
            // server, so a direct handler call gets the same checks here.
            const cleanTerm = typeof term === "string" ? term.trim() : "";
            if (!cleanTerm) throw new Error("term must not be empty.");
            if (!Number.isInteger(limit) || limit < 1 || limit > 5)
                throw new Error("limit must be between 1 and 5.");
            const url = new URL("https://api.urbandictionary.com/v0/define");
            url.search = new URLSearchParams({ term: cleanTerm });
            const data = await fetchJson(url);
            if (!Array.isArray(data.list))
                throw new Error("Invalid Urban Dictionary response");
            return {
                term: cleanTerm,
                total: data.list.length,
                definitions: data.list.slice(0, limit).map(entry),
            };
        },
    ],
];
