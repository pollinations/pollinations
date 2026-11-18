// Wikivoyage travel-guide search. Keyless, one fetch per call.
// Snippets arrive with <span class="searchmatch"> markup and HTML entities
// (&#039;, &quot;); they are returned as plain text. Wikivoyage is a separate
// wiki from Wikipedia, but it speaks the same MediaWiki search API — an agent
// after a travel guide rather than an encyclopedia article gets no answer
// from wikipedia_search.
import { z } from "zod";

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

const cleanSnippet = (text) =>
    decodeEntities(stripTags(text)).replace(/\s+/g, " ").trim();

export const wikivoyageTools = [
    [
        "wikivoyage_search",
        "Search Wikivoyage travel guides. Returns matching guides with title, page id, size, word count, a plain-text snippet and the guide URL. Wikivoyage is a travel wiki, not Wikipedia — use it for where to go and what to do, not for encyclopedia facts.",
        {
            query: z.string().trim().min(1).max(200),
            limit: z.number().int().min(1).max(10).default(5),
        },
        async ({ query, limit }, fetchJson) => {
            const q = String(query ?? "").trim();
            if (!q) throw new Error("query must not be blank");
            const n =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 5;
            const data = await fetchJson(
                `https://en.wikivoyage.org/w/api.php?${new URLSearchParams({
                    action: "query",
                    list: "search",
                    srsearch: q,
                    srlimit: String(n),
                    format: "json",
                })}`,
            );
            if (!data?.query?.search || !Array.isArray(data.query.search))
                throw new Error("Unexpected Wikivoyage response");
            return {
                query: q,
                total: data.query.searchinfo?.totalhits ?? 0,
                guides: data.query.search.slice(0, n).map((hit) => ({
                    title: hit.title,
                    pageid: hit.pageid,
                    size: hit.size,
                    wordcount: hit.wordcount,
                    snippet: cleanSnippet(hit.snippet),
                    url: `https://en.wikivoyage.org/wiki/${encodeURIComponent(hit.title)}`,
                })),
            };
        },
    ],
];
