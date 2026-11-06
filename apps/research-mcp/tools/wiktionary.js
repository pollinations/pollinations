import { z } from "zod";

// Language selection follows Sugamdeol's dictionary tools: pollinations/pollinations#17822.
export const wiktionaryTools = [
    [
        "wiktionary_define",
        "Read definitions, parts of speech and examples from English Wiktionary. Definitions and examples retain source HTML markup; cite the source URL (CC BY-SA).",
        {
            word: z.string().trim().min(1).max(100),
            language: z
                .string()
                .trim()
                .min(2)
                .max(32)
                .default("en")
                .describe(
                    "Definition language code or name, e.g. en, English, Finnish.",
                ),
        },
        async ({ word, language }, fetchJson) => {
            const data = await fetchJson(
                `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`,
            );
            const match = Object.entries(data).find(
                ([code, entries]) =>
                    code.toLowerCase() === language.toLowerCase() ||
                    entries.some(
                        (entry) =>
                            entry.language.toLowerCase() ===
                            language.toLowerCase(),
                    ),
            );
            if (!match)
                throw new Error(`No ${language} definitions for "${word}".`);
            return {
                word,
                language: match[0],
                entries: match[1],
                url: `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}`,
            };
        },
    ],
];
