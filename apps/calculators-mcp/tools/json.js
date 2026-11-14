import { z } from "zod";

// Format, minify or validate JSON, computed locally — no network or model
// calls. Pretty-printing uses the requested indent (1-8 spaces, default 2);
// sorting keys is recursive, so nested objects come out sorted too;
// validation reports the parse error with its position when V8 provides
// one. Input is capped at 512 KiB, matching the server's fetch-cap spirit.
const MAX_INPUT = 524288;

function sortKeys(value) {
    if (Array.isArray(value)) {
        return value.map(sortKeys);
    }
    if (value !== null && typeof value === "object") {
        const sorted = {};
        for (const key of Object.keys(value).sort()) {
            sorted[key] = sortKeys(value[key]);
        }
        return sorted;
    }
    return value;
}

function parseErrorMessage(error) {
    const match = /at position (\d+)/.exec(error.message);
    return match === null
        ? `Invalid JSON: ${error.message}`
        : `Invalid JSON at position ${match[1]}: ${error.message}`;
}

export const jsonTools = [
    [
        "json_format",
        "Pretty-print, minify or validate JSON, computed locally. Pretty mode uses the requested indent (1-8 spaces, default 2); sort_keys recursively sorts object keys (arrays keep their order). Validate mode only checks the input and reports valid true. Invalid JSON is rejected with the parse error and its position. No network or model calls.",
        {
            input: z
                .string()
                .min(1)
                .max(MAX_INPUT)
                .describe(
                    'The JSON text to process, up to 512 KiB, e.g. \'{"b":1,"a":2}\'.',
                ),
            mode: z
                .enum(["pretty", "minify", "validate"])
                .default("pretty")
                .describe(
                    'What to do with the input: "pretty" reprints it with indentation, "minify" removes all whitespace, "validate" only checks it.',
                ),
            indent: z
                .number()
                .int()
                .min(1)
                .max(8)
                .default(2)
                .describe(
                    "Spaces per indent level for pretty mode (1-8, default 2); ignored by minify and validate.",
                ),
            sort_keys: z
                .boolean()
                .default(false)
                .describe(
                    "Sort object keys alphabetically, recursively, before formatting; default false.",
                ),
        },
        ({ input, mode, indent, sort_keys }) => {
            if (input.length > MAX_INPUT) {
                throw new Error(
                    `Input is ${input.length} characters, over the 512 KiB limit.`,
                );
            }
            let parsed;
            try {
                parsed = JSON.parse(input);
            } catch (error) {
                throw new Error(parseErrorMessage(error));
            }
            if (sort_keys) {
                parsed = sortKeys(parsed);
            }
            if (mode === "validate") {
                return { valid: true, mode, output: null };
            }
            return {
                valid: true,
                mode,
                output:
                    mode === "pretty"
                        ? JSON.stringify(parsed, null, indent)
                        : JSON.stringify(parsed),
            };
        },
    ],
];
