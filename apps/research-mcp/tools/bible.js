import { z } from "zod";

// bible-api.com: no key. Default translation is WEB (World English Bible).
// Only these translations exist upstream — anything else 404s, so the
// handler validates against this list before any fetch.
const translations = ["web", "kjv", "clementine", "bbe"];

export const bibleTools = [
    [
        "bible_verse",
        "Look up a Bible passage by reference, e.g. John 3:16, Psalm 23 or John 3:16-17. Returns the reference, the passage text and the translation used. Default translation is the World English Bible; kjv, clementine and bbe are also available. No key needed.",
        {
            reference: z.string().trim().min(1).max(100),
            translation: z.enum(translations).default("web"),
        },
        async ({ reference, translation = "web" }, fetchJson) => {
            // Normalize here too: zod trims only when args go through the
            // MCP server, so a direct handler call could pass whitespace.
            const ref = reference.replace(/\s+/g, " ").trim();
            if (!ref) throw new Error("reference must not be empty");
            if (!translations.includes(translation))
                throw new Error(
                    `unknown translation: ${translation} (available: ${translations.join(", ")})`,
                );
            const url = new URL(
                `https://bible-api.com/${encodeURIComponent(ref)}`,
            );
            if (translation !== "web")
                url.searchParams.set("translation", translation);
            const data = await fetchJson(url);
            return {
                reference: data.reference,
                text: data.text,
                translation: data.translation_name,
                translation_id: data.translation_id,
                verses: data.verses.map((verse) => ({
                    book: verse.book_name,
                    chapter: verse.chapter,
                    verse: verse.verse,
                    text: verse.text,
                })),
            };
        },
    ],
];
