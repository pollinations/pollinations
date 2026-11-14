import { z } from "zod";

/**
 * Convert an arbitrary string into a URL‑friendly slug.
 *   1. Trim whitespace.
 *   2. Lower‑case.
 *   3. Replace any sequence of non‑alphanumeric characters with a single hyphen.
 *   4. Trim leading/trailing hyphens.
 *   5. If the result is empty, throw – the input had no alphanumerics.
 */
function slugify(str) {
    const trimmed = str.trim();
    const lowered = trimmed.toLowerCase();
    const replaced = lowered.replace(/[^a-z0-9]+/g, "-");
    const trimmedHyphens = replaced.replace(/^[-]+|[-]+$/g, "");
    if (trimmedHyphens.length === 0)
        throw new Error(`value ${JSON.stringify(str)} yields empty slug.`);
    return trimmedHyphens;
}

export const slugifyTools = [
    [
        "slugify",
        "Convert an arbitrary string to a URL‑slug (lower‑case, hyphen‑separated, alphanumeric only). Useful for generating clean identifiers, filenames or URLs. No network or model calls.",
        {
            value: z.string().min(1).max(4096).describe("The text to slugify."),
        },
        ({ value }) => ({ slug: slugify(value) }),
    ],
];
