import { z } from "zod";

// Two-row Levenshtein distance using flat Uint32Array buffers. Memory is O(min(n, m)),
// keeping memory under 40 KB even at the 10,000-character cap.
function computeLevenshtein(str1, str2) {
    if (str1 === str2) return 0;
    if (str1.length === 0) return str2.length;
    if (str2.length === 0) return str1.length;

    // Swap to ensure s1 is shorter to minimize buffer allocation
    let s1 = str1;
    let s2 = str2;
    if (s1.length > s2.length) {
        s1 = str2;
        s2 = str1;
    }

    const len1 = s1.length;
    const len2 = s2.length;

    let prevRow = new Uint32Array(len1 + 1);
    let currRow = new Uint32Array(len1 + 1);

    for (let i = 0; i <= len1; i += 1) {
        prevRow[i] = i;
    }

    for (let j = 1; j <= len2; j += 1) {
        currRow[0] = j;
        const char2 = s2.charCodeAt(j - 1);

        for (let i = 1; i <= len1; i += 1) {
            const cost = s1.charCodeAt(i - 1) === char2 ? 0 : 1;
            currRow[i] = Math.min(
                currRow[i - 1] + 1, // insertion
                prevRow[i] + 1, // deletion
                prevRow[i - 1] + cost, // substitution
            );
        }

        const temp = prevRow;
        prevRow = currRow;
        currRow = temp;
    }

    return prevRow[len1];
}

export const levenshteinTools = [
    [
        "levenshtein",
        "Calculate the Levenshtein edit distance and normalized similarity ratio between two strings locally. Useful for fuzzy matching, detecting typos, comparing model outputs, and calculating character edits without network or LLM calls.",
        {
            a: z.string().max(10000).describe("First string to compare."),
            b: z.string().max(10000).describe("Second string to compare."),
            case_sensitive: z
                .boolean()
                .default(true)
                .describe(
                    "Whether to distinguish uppercase and lowercase characters (default: true).",
                ),
        },
        ({ a, b, case_sensitive }) => {
            const s1 = case_sensitive ? a : a.toLowerCase();
            const s2 = case_sensitive ? b : b.toLowerCase();
            const distance = computeLevenshtein(s1, s2);
            const maxLen = Math.max(s1.length, s2.length);
            const similarity =
                maxLen === 0
                    ? 1.0
                    : Math.round((1 - distance / maxLen) * 10000) / 10000;
            return {
                distance,
                similarity,
                length_a: a.length,
                length_b: b.length,
            };
        },
    ],
];
