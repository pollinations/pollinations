import { z } from "zod";

// Split on anything that is not a letter or digit, then on camelCase and
// acronym boundaries inside each chunk. "HTTPRequest" becomes ["HTTP",
// "Request"], "version2Final" becomes ["version2", "Final"], and
// "hello-world" becomes ["hello", "world"].
function splitWords(text) {
    const chunks = text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    const words = [];
    for (const chunk of chunks) {
        let start = 0;
        for (let i = 1; i < chunk.length; i++) {
            const previous = chunk[i - 1];
            const current = chunk[i];
            const next = chunk[i + 1];
            const lowerToUpper = isLowerOrDigit(previous) && isUpper(current);
            // "HTTPRequest": split before the R, where an upper run ends and
            // a capitalized word starts.
            const acronymEnd =
                isUpper(previous) &&
                isUpper(current) &&
                next !== undefined &&
                isLower(next);
            if (lowerToUpper || acronymEnd) {
                words.push(chunk.slice(start, i));
                start = i;
            }
        }
        words.push(chunk.slice(start));
    }
    return words;
}

function isUpper(character) {
    return (
        character === character.toUpperCase() &&
        character !== character.toLowerCase()
    );
}

function isLower(character) {
    return (
        character === character.toLowerCase() &&
        character !== character.toUpperCase()
    );
}

function isLowerOrDigit(character) {
    return isLower(character) || (character >= "0" && character <= "9");
}

function lower(word) {
    return word.toLowerCase();
}

function capital(word) {
    const [first, ...rest] = [...word];
    return first.toUpperCase() + rest.join("").toLowerCase();
}

const converters = {
    camel: (words) =>
        words
            .map((word, index) => (index === 0 ? lower(word) : capital(word)))
            .join(""),
    pascal: (words) => words.map(capital).join(""),
    snake: (words) => words.map(lower).join("_"),
    kebab: (words) => words.map(lower).join("-"),
    title: (words) => words.map(capital).join(" "),
    upper: (words) => words.map((word) => word.toUpperCase()).join(" "),
    lower: (words) => words.map(lower).join(" "),
};

export const caseTools = [
    [
        "convert_case",
        "Convert text between camelCase, PascalCase, snake_case, kebab-case, Title Case, UPPER and lower. Pure local string work: acronyms stay one word (HTTPRequest becomes http_request), numbers stay attached to their word, and separators can be mixed. UPPER and lower join words with a single space.",
        {
            text: z
                .string()
                .min(1)
                .max(4096)
                .describe(
                    "The text to convert, e.g. hello_world or HTTPRequest.",
                ),
            to_case: z
                .enum([
                    "camel",
                    "pascal",
                    "snake",
                    "kebab",
                    "title",
                    "upper",
                    "lower",
                ])
                .default("camel")
                .describe("Case to convert to."),
        },
        ({ text, to_case }) => {
            const words = splitWords(text);
            if (words.length === 0)
                throw new Error(
                    `text ${JSON.stringify(text)} has no words to convert.`,
                );
            return { result: converters[to_case](words), to_case };
        },
    ],
];
