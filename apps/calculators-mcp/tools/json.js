import { z } from "zod";

export const jsonTools = [
    [
        "json_format",
        "Pretty-print or minify a JSON string. Invalid JSON returns a readable parse error instead of throwing.",
        {
            text: z.string().describe("JSON text to format"),
            mode: z
                .enum(["pretty", "minify"])
                .default("pretty")
                .describe("pretty = two-space indent, minify = no whitespace"),
        },
        async ({ text, mode }) => {
            let parsed;
            try {
                parsed = JSON.parse(text);
            } catch (error) {
                return "Invalid JSON: " + error.message;
            }
            return mode === "minify"
                ? JSON.stringify(parsed)
                : JSON.stringify(parsed, null, 2);
        },
    ],
];
