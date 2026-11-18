// Wikisource public-domain text search. Keyless.
//
// Search returns page titles only, and `prop=extracts` comes back empty for
// the pages that matter: chapter pages are transclusions of Page: scan pages
// (`<pages index="...djvu" from=11 to=15 />`), so there is no extractable
// text in the wikitext at all — the version page and the chapter page both
// answer with an empty extract. The text only exists in the parsed HTML, so
// each hit is read with `action=parse&prop=text` and the opening is stripped
// to plain text and capped client-side. The parsed HTML also carries the
// header template (a `ws-noexport` div with its styles) and the scan page
// number, so those are dropped first; what is left is the work's own text.
// Wikisource holds the texts themselves — use it for the words of a
// public-domain work, not for encyclopedia facts (wikipedia_search).
import { z } from "zod";

// The most text returned for one page. A chapter runs to several thousand
// characters; ten results at this cap stay well under the 512 KiB result cap.
const MAX_TEXT = 2000;

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

// Drop every `<tag ...marker...>...</tag>` block, counting nested `<tag`
// opens so a nested close does not end the block early. A block whose close
// never arrives swallows the rest of the string, which is the safe
// direction — no header or style content survives. An empty marker drops
// every block of that tag. Used for the header template
// (`<div class="ws-noexport">`, which wraps the styles and the chapter
// navigation) and for any `<style>` block left standing outside it.
const dropBlocks = (html, tag, marker) => {
    const open = `<${tag}`;
    const close = `</${tag}>`;
    let out = "";
    let i = 0;
    while (i < html.length) {
        const at = html.indexOf(open, i);
        if (at === -1) {
            out += html.slice(i);
            break;
        }
        const tagEnd = html.indexOf(">", at);
        if (tagEnd === -1) {
            out += html.slice(i, at);
            break;
        }
        if (!html.slice(at, tagEnd + 1).includes(marker)) {
            out += html.slice(i, tagEnd + 1);
            i = tagEnd + 1;
            continue;
        }
        out += html.slice(i, at);
        let depth = 1;
        let j = tagEnd + 1;
        while (j < html.length && depth > 0) {
            const nextOpen = html.indexOf(open, j);
            const nextClose = html.indexOf(close, j);
            if (nextClose === -1) {
                j = html.length;
                break;
            }
            if (nextOpen !== -1 && nextOpen < nextClose) {
                depth += 1;
                j = nextOpen + open.length;
            } else {
                depth -= 1;
                j = nextClose + close.length;
            }
        }
        i = j;
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

// Plain text for a search snippet: strip the search-match markup, decode
// entities, collapse whitespace. Snippets arrive with `<span
// class="searchmatch">` and entities (`&quot;`, `&#039;`).
const cleanSnippet = (text) =>
    decodeEntities(stripTags(text))
        .replace(/[\s\u200b]+/g, " ")
        .trim();

// Plain text for a parsed page: drop the header template and any style
// blocks first, then strip tags, decode entities and collapse whitespace.
// `\u200b` (a zero-width space the chapter heading carries) is not matched
// by `\s`, so it is collapsed explicitly.
const cleanText = (html) =>
    decodeEntities(
        stripTags(
            dropBlocks(dropBlocks(html, "div", "ws-noexport"), "style", ""),
        ),
    )
        .replace(/[\s\u200b]+/g, " ")
        .trim();

export const wikisourceTools = [
    [
        "wikisource_search",
        "Search Wikisource public-domain texts. Returns matching pages with title, page id, a plain-text snippet, the opening of the page text (at most 2000 characters) and the page URL. Wikisource holds the texts themselves — use it for the words of a public-domain work, not for encyclopedia facts.",
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
                `https://en.wikisource.org/w/api.php?${new URLSearchParams({
                    action: "query",
                    list: "search",
                    srsearch: q,
                    srnamespace: "0",
                    srlimit: String(n),
                    format: "json",
                })}`,
            );
            if (!data?.query?.search || !Array.isArray(data.query.search))
                throw new Error("Unexpected Wikisource response");
            const hits = data.query.search.slice(0, n);
            const results = await Promise.all(
                hits.map(async (hit) => {
                    // A hit that cannot be read keeps its snippet and URL
                    // with text null, instead of failing the other results.
                    let text = null;
                    let truncated = false;
                    const parsed = await fetchJson(
                        `https://en.wikisource.org/w/api.php?${new URLSearchParams(
                            {
                                action: "parse",
                                page: hit.title,
                                prop: "text",
                                format: "json",
                                formatversion: "2",
                                disableeditsection: "1",
                                redirects: "1",
                            },
                        )}`,
                    );
                    if (parsed?.parse?.text) {
                        const cleaned = cleanText(parsed.parse.text);
                        truncated = cleaned.length > MAX_TEXT;
                        text = cleaned.slice(0, MAX_TEXT);
                    }
                    return {
                        title: hit.title,
                        pageid: hit.pageid,
                        snippet: cleanSnippet(hit.snippet),
                        text,
                        truncated,
                        url: `https://en.wikisource.org/wiki/${encodeURIComponent(hit.title)}`,
                    };
                }),
            );
            return {
                query: q,
                total: data.query.searchinfo?.totalhits ?? 0,
                results,
            };
        },
    ],
];
