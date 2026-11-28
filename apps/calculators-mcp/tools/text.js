import { z } from "zod";

export const textTools = [
    [
        "text_stats",
        "Count characters, characters without whitespace, words, lines and sentences. Counts Unicode code points, not UTF-16 units. Word and sentence splitting is a simple heuristic, not a language-aware tokenizer.",
        {
            text: z
                .string()
                .describe("Text to measure. An empty string is allowed."),
        },
        async ({ text }) => {
            const characters = [...text].length;
            const charactersNoWhitespace = [...text.replace(/\s/g, "")].length;
            const words = text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
            const lines = text === "" ? 0 : text.split(/\r\n|\r|\n/).length;
            const sentences =
                text.trim() === ""
                    ? 0
                    : text
                          .split(/[.!?。！？]+/)
                          .map((part) => part.trim())
                          .filter(Boolean).length;
            return { characters, charactersNoWhitespace, words, lines, sentences };
        },
    ],
];
