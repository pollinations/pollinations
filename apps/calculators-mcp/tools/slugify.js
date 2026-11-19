import { z } from "zod";

/**
 * Convert an arbitrary string into a URL‑friendly slug.
 *   1. Trim whitespace.
 *   2. Fold accents and compatibility forms to ASCII (NFKD, drop combining marks).
 *   3. Lower‑case.
 *   4. Replace any sequence of non‑alphanumeric characters with a single hyphen.
 *   5. Trim leading/trailing hyphens.
 *   6. If the result is empty, throw – the input had no alphanumerics.
 */

// Letters NFKD leaves alone, because they are not a base letter plus a mark.
const LETTER_FOLDS = {
    ß: "ss",
    æ: "ae",
    œ: "oe",
    ø: "o",
    ł: "l",
    đ: "d",
    ð: "d",
    þ: "th",
    ı: "i",
};

function foldToAscii(str) {
    return str
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(
            /[ßæœøłđðþı]/gi,
            (letter) => LETTER_FOLDS[letter.toLowerCase()] ?? letter,
        );
}

function slugify(str) {
    const folded = foldToAscii(str.trim()).toLowerCase();
    const replaced = folded.replace(/[^a-z0-9]+/g, "-");
    const trimmedHyphens = replaced.replace(/^[-]+|[-]+$/g, "");
    if (trimmedHyphens.length === 0)
        throw new Error(`value ${JSON.stringify(str)} yields empty slug.`);
    return trimmedHyphens;
}

export const slugifyTools = [
    [
        "slugify",
        'Convert an arbitrary string to a URL‑slug (lower‑case, hyphen‑separated, ASCII alphanumeric only). Accents and compatibility forms are folded to ASCII, so "Café" becomes "cafe" rather than "caf". Useful for generating clean identifiers, filenames or URLs. No network or model calls.',
        {
            value: z.string().min(1).max(4096).describe("The text to slugify."),
        },
        ({ value }) => ({ slug: slugify(value) }),
    ],
];
