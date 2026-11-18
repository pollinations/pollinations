// eCFR regulation search. Keyless.
//
// The search API returns sections of the Code of Federal Regulations
// matching a keyword, with the full title/chapter/part/section hierarchy,
// headings and a text excerpt. Headings and excerpts carry HTML markup
// (`<strong>` around the matched term, `<span class="elipsis">` in the
// excerpt), so both are stripped to plain text char-by-char, never with a
// regex — the InterPro lesson from PR #20161. The same section can appear
// twice with different effective dates (one record per version), so each
// result carries its effective date and the duplicates are kept as
// returned. This searches the code itself — the rules as they stand — not
// new rules; the Federal Register tool in open PR #20151 covers those.
import { z } from "zod";

const API_ROOT = "https://www.ecfr.gov/api/search/v1/results";
const MAX_EXCERPT = 500;

// Strip HTML tags one character at a time. A single regex pass can leave a
// tag behind when tags nest (e.g. `<<script>` survives `<[^>]*>` as
// `<script>`), so drop everything between `<` and the next `>` instead. A
// `<` with no closing `>` swallows the rest of the string, which is the safe
// direction — no markup survives. A lone `>` outside a tag is kept, as text.
// (Same parser as the InterPro fix for PR #20161; CodeQL flags regex strips.)
const stripTags = (text) => {
    let out = "";
    let inTag = false;
    for (const ch of String(text ?? "")) {
        if (inTag) {
            if (ch === ">") inTag = false;
        } else if (ch === "<") {
            inTag = true;
        } else {
            out += ch;
        }
    }
    return out;
};

const ENTITIES = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
};

const decodeEntities = (text) =>
    String(text ?? "").replace(
        /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
        (match, entity) => {
            const key = entity.toLowerCase();
            if (key.startsWith("#x")) {
                const code = Number.parseInt(key.slice(2), 16);
                return code <= 0x10ffff ? String.fromCodePoint(code) : match;
            }
            if (key.startsWith("#")) {
                const code = Number.parseInt(key.slice(1), 10);
                return code <= 0x10ffff ? String.fromCodePoint(code) : match;
            }
            return ENTITIES[key] ?? match;
        },
    );

// Plain text for a heading or excerpt: strip the markup, decode entities,
// collapse whitespace. Excerpts arrive with `<strong>` around the matched
// term and a `<span class="elipsis">…</span>` where text was cut.
const cleanText = (text) =>
    decodeEntities(stripTags(text))
        .replace(/[\s\u200b]+/g, " ")
        .trim();

function formatResult(item) {
    const hierarchy = item.hierarchy ?? {};
    const headings = item.headings ?? {};
    const title = hierarchy.title ?? null;
    const section = hierarchy.section ?? null;
    const citation =
        title && section
            ? `${title} CFR ${section}`
            : title
              ? `Title ${title}`
              : null;
    const excerpt = cleanText(item.full_text_excerpt);
    return {
        citation,
        type: item.type ?? null,
        title: cleanText(headings.title) || null,
        part: cleanText(headings.part) || null,
        section: cleanText(headings.section) || null,
        excerpt: excerpt ? excerpt.slice(0, MAX_EXCERPT) : null,
        effective_from: item.starts_on ?? null,
        url:
            title && section
                ? `https://www.ecfr.gov/current/title-${title}/section-${section}`
                : null,
    };
}

export const ecfrTools = [
    [
        "ecfr_search",
        "Search the Code of Federal Regulations (eCFR) by keyword. Returns matching sections with their citation (e.g. 10 CFR 460.101), title, part and section headings, a plain-text excerpt and the effective date. This is the code as it stands — current rules, not new rules; the Federal Register covers proposed and newly published rules.",
        {
            query: z.string().trim().min(1).max(200),
            limit: z.number().int().min(1).max(10).default(5),
        },
        async ({ query, limit }, fetchJson) => {
            const trimmed = String(query ?? "").trim();
            if (!trimmed) throw new Error("query must not be blank");
            const perPage =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 5;
            const data = await fetchJson(
                `${API_ROOT}?${new URLSearchParams({
                    query: trimmed,
                    page: "1",
                    per_page: String(perPage),
                })}`,
            );
            if (!data || !Array.isArray(data.results))
                throw new Error("eCFR search returned an unexpected response");
            return {
                query: trimmed,
                total: data.meta?.total_count ?? data.results.length,
                results: data.results.map(formatResult),
            };
        },
    ],
];
