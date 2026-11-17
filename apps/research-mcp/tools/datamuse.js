import { z } from "zod";

// Datamuse query parameter per relation.
const RELATIONS = {
    "means-like": "ml",
    synonyms: "rel_syn",
    antonyms: "rel_ant",
    rhymes: "rel_rhy",
    "sounds-like": "sl",
    "triggered-by": "rel_trg",
};

export const datamuseTools = [
    [
        "datamuse_words",
        "Find words related to a word via Datamuse: similar-meaning words, synonyms, antonyms, rhymes, sound-alikes, or words triggered by it. Returns each word with its relevance score. No key required.",
        {
            word: z.string().trim().min(1).max(100),
            relation: z
                .enum([
                    "means-like",
                    "synonyms",
                    "antonyms",
                    "rhymes",
                    "sounds-like",
                    "triggered-by",
                ])
                .default("synonyms")
                .describe("How the returned words relate to the input word."),
            limit: z.number().int().min(1).max(10).default(5),
        },
        async ({ word, relation, limit }, fetchJson) => {
            const data = await fetchJson(
                `https://api.datamuse.com/words?${RELATIONS[relation]}=${encodeURIComponent(word)}&max=${limit}`,
            );
            if (!Array.isArray(data))
                throw new Error(
                    `Datamuse returned an unexpected response for "${word}".`,
                );
            return {
                word,
                relation,
                results: data.map(({ word: related, score }) => ({
                    word: related,
                    score,
                })),
            };
        },
    ],
];
