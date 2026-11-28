import { z } from "zod";

const ALLOWED_FLAGS = new Set(["g", "i", "m", "s", "u"]);
const MAX_MATCHES = 100;

function parseFlags(flags) {
    const seen = new Set();
    for (const ch of flags) {
        if (!ALLOWED_FLAGS.has(ch) || seen.has(ch)) {
            throw new Error(`Unsupported or duplicate regex flag: ${ch}`);
        }
        seen.add(ch);
    }
    return [...seen].join("");
}

export const regexTools = [
    [
        "test_regex",
        "Test a regular expression against input text locally. Returns match positions, capture groups, named groups, and optional replacement output.",
        {
            pattern: z.string().min(1).max(1000).describe("Regular expression pattern"),
            text: z.string().max(100000).describe("Input text to match against"),
            flags: z
                .string()
                .max(5)
                .default("g")
                .describe("Regex flags (subset of g, i, m, s, u)"),
            replacement: z
                .string()
                .max(10000)
                .optional()
                .describe("Optional replacement string (supports $1, $<name>, etc.)"),
        },
        ({ pattern, text, flags, replacement }) => {
            const normalizedFlags = parseFlags(flags);
            let re;
            try {
                re = new RegExp(pattern, normalizedFlags);
            } catch (err) {
                throw new Error(
                    `Invalid regular expression: ${err instanceof Error ? err.message : String(err)}`,
                );
            }

            const matches = [];
            if (normalizedFlags.includes("g")) {
                for (const m of text.matchAll(re)) {
                    matches.push({
                        match: m[0],
                        index: m.index ?? 0,
                        groups: m.slice(1),
                        ...(m.groups ? { named_groups: m.groups } : {}),
                    });
                    if (matches.length >= MAX_MATCHES) break;
                }
            } else {
                const m = re.exec(text);
                if (m) {
                    matches.push({
                        match: m[0],
                        index: m.index,
                        groups: m.slice(1),
                        ...(m.groups ? { named_groups: m.groups } : {}),
                    });
                }
            }

            const result = {
                matched: matches.length > 0,
                count: matches.length,
                truncated: normalizedFlags.includes("g") && matches.length === MAX_MATCHES,
                matches,
            };

            if (replacement !== undefined) {
                result.replaced = text.replace(re, replacement);
            }
            return result;
        },
    ],
];
