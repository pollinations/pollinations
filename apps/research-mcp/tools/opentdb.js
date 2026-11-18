import { z } from "zod";

// Open Trivia DB returns HTML entities in question and answer text
// (&quot;, &#039;, &eacute; ...). The closed #18247 was rejected partly
// because its server returned them undecoded, so answers could be shown
// incorrectly — this tool decodes them before returning anything.
const NAMED_ENTITIES = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    rsquo: "’",
    lsquo: "‘",
    rdquo: "”",
    ldquo: "“",
    mdash: "—",
    ndash: "–",
    hellip: "…",
    eacute: "é",
    egrave: "è",
    ecirc: "ê",
    euml: "ë",
    aacute: "á",
    agrave: "à",
    acirc: "â",
    auml: "ä",
    aring: "å",
    oacute: "ó",
    ograve: "ò",
    ocirc: "ô",
    ouml: "ö",
    uacute: "ú",
    ugrave: "ù",
    ucirc: "û",
    uuml: "ü",
    iacute: "í",
    igrave: "ì",
    icirc: "î",
    iuml: "ï",
    ntilde: "ñ",
    ccedil: "ç",
    szlig: "ß",
    yacute: "ý",
    copy: "©",
    reg: "®",
    deg: "°",
    plusmn: "±",
    frac12: "½",
    frac14: "¼",
    frac34: "¾",
    times: "×",
    divide: "÷",
};

function codePoint(code, base) {
    const value = Number.parseInt(code, base);
    return value >= 0 && value <= 0x10ffff
        ? String.fromCodePoint(value)
        : `&#${base === 16 ? "x" : ""}${code};`;
}

function decodeEntities(text) {
    return text
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => codePoint(hex, 16))
        .replace(/&#(\d+);/g, (_, dec) => codePoint(dec, 10))
        .replace(/&([a-zA-Z]+);/g, (_, name) =>
            Object.hasOwn(NAMED_ENTITIES, name)
                ? NAMED_ENTITIES[name]
                : `&${name};`,
        );
}

const DIFFICULTIES = ["easy", "medium", "hard"];

export const opentdbTools = [
    [
        "trivia_question",
        "Fetch trivia questions from Open Trivia DB by amount, category and difficulty. Question and answer text comes back with HTML entities decoded, so quotes and accents read as plain text.",
        {
            amount: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(1)
                .describe("How many questions to fetch, 1-10."),
            category: z
                .number()
                .int()
                .positive()
                .optional()
                .describe(
                    "Open Trivia DB category id, e.g. 9 for General Knowledge.",
                ),
            difficulty: z
                .enum(DIFFICULTIES)
                .optional()
                .describe("easy, medium or hard."),
        },
        async ({ amount = 1, category, difficulty }, fetchJson) => {
            if (!Number.isInteger(amount) || amount < 1 || amount > 10)
                throw new Error("amount must be an integer between 1 and 10.");
            if (
                category !== undefined &&
                (!Number.isInteger(category) || category < 1)
            )
                throw new Error("category must be a positive integer.");
            if (difficulty !== undefined && !DIFFICULTIES.includes(difficulty))
                throw new Error("difficulty must be easy, medium or hard.");
            const params = new URLSearchParams({ amount: String(amount) });
            if (category !== undefined)
                params.set("category", String(category));
            if (difficulty !== undefined) params.set("difficulty", difficulty);
            const data = await fetchJson(
                `https://opentdb.com/api.php?${params}`,
            );
            if (data.response_code === 1) return { total: 0, questions: [] };
            if (data.response_code !== 0)
                throw new Error(
                    `Open Trivia DB returned response_code ${data.response_code}.`,
                );
            const questions = (data.results ?? []).map((q) => ({
                type: q.type,
                difficulty: q.difficulty,
                category: decodeEntities(q.category),
                question: decodeEntities(q.question),
                correct_answer: decodeEntities(q.correct_answer),
                incorrect_answers: q.incorrect_answers.map(decodeEntities),
            }));
            return { total: questions.length, questions };
        },
    ],
];
