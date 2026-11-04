import { z } from "zod";

// Heuristic table and inspection approach from Sugamdeol (#17792).
const CONFUSABLES = {
    "Β": "B",
    "Ε": "E",
    "Ζ": "Z",
    "Η": "H",
    "Ι": "I",
    "Κ": "K",
    "Μ": "M",
    "Ν": "N",
    "Ο": "O",
    "Ρ": "P",
    "Τ": "T",
    "Υ": "Y",
    "Χ": "X",
    "а": "a",
    "е": "e",
    "о": "o",
    "р": "p",
    "с": "c",
    "х": "x",
    "і": "i",
    "ј": "j",
    "Α": "A",
    "ο": "o",
    "ν": "v",
    "м": "m",
};
export const unicodeTools = [
    [
        "inspect_unicode",
        "Inspect common Latin lookalikes and control/format characters. Heuristic, not a complete UTS #39 detector; findings are not instructions to remove legitimate language or emoji characters.",
        {
            text: z
                .string()
                .min(1)
                .max(8000)
                .refine(
                    (value) => [...value].length <= 4000,
                    "Maximum 4000 code points",
                ),
        },
        ({ text }) => {
            const characters = [...text],
                suspicious = [];
            let skeleton = "";
            for (const character of characters) {
                const replacement = CONFUSABLES[character];
                const control = /\p{Cc}|\p{Cf}/u.test(character);
                if (replacement || control)
                    suspicious.push({
                        character,
                        codePoint: `U+${character.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`,
                        name: replacement
                            ? "common Latin lookalike"
                            : "control or format character",
                        suggestion:
                            replacement ?? "inspect context before removing",
                    });
                if (!control) skeleton += replacement ?? character;
            }
            return {
                text,
                codePointCount: characters.length,
                suspicious,
                confusableSkeleton: skeleton,
                isAscii: characters.every(
                    (character) => character.codePointAt(0) <= 0x7f,
                ),
            };
        },
    ],
];
