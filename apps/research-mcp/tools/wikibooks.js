// Wikibooks textbook search. Keyless.
//
// Search returns page titles only, so each hit is read with
// `prop=extracts&explaintext=1`, which returns the page as plain text —
// unlike Wikisource, where extracts come back empty for transcluded pages,
// Wikibooks extracts carry the real text. Textbook pages open with their
// content (unlike Wikiquote, where the quotes live under a section heading),
// so the tool returns the opening paragraphs from the start of the extract,
// capped client-side. Cookbook pages open with a navigation breadcrumb line
// ("Cookbook | Recipes | Ingredients | ..."), which is dropped.
// Wikibooks holds textbooks and how-to guides — use it for learning material,
// not for encyclopedia facts (wikipedia_search), quotations
// (wikiquote_search) or full public-domain texts (wikisource_search).
import { z } from "zod";

// The most text returned for one page. Five results at this cap stay well
// under the 512 KiB result cap.
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
// class="searchmatch">` and entities (`&quot;`, `&#039;`, `&nbsp;`).
const cleanSnippet = (text) =>
    decodeEntities(stripTags(text))
        .replace(/[\s\u200b]+/g, " ")
        .trim();

// True when a leading line is a navigation breadcrumb rather than content:
// pipe-separated, no sentence-ending period ("Cookbook | Recipes |
// Ingredients | ..."). Only checked on the leading lines of an extract,
// before the first real paragraph, so a pipe inside the body text is never
// dropped.
const isNavLine = (line) => {
    const trimmed = line.trim();
    return (
        trimmed.length > 0 && trimmed.includes(" | ") && !trimmed.includes(".")
    );
};

// The opening text of a page's plain-text extract: leading navigation
// breadcrumbs dropped, section-heading lines dropped (headings share a
// paragraph with the text that follows them on some pages, so they are
// filtered line by line rather than paragraph by paragraph), paragraphs
// split on blank lines, wikitext italic markers (`''`) removed, entities
// decoded, whitespace collapsed. The extract carries no HTML, so no tag
// stripping is needed here.
const cleanText = (extract) => {
    const lines = String(extract ?? "").split("\n");
    let start = 0;
    while (start < lines.length) {
        const line = lines[start].trim();
        if (line === "" || isNavLine(line)) {
            start++;
        } else {
            break;
        }
    }
    const paragraphs = lines
        .slice(start)
        .filter((line) => !line.trim().startsWith("="))
        .join("\n")
        .split(/\n\s*\n/)
        .map((paragraph) =>
            decodeEntities(paragraph.replaceAll("''", ""))
                .replace(/[\s\u200b]+/g, " ")
                .trim(),
        )
        .filter((paragraph) => paragraph.length > 0);
    let text = "";
    let truncated = false;
    for (const paragraph of paragraphs) {
        const next = text === "" ? paragraph : `${text}\n\n${paragraph}`;
        if (next.length > MAX_TEXT) {
            text = next.slice(0, MAX_TEXT);
            truncated = true;
            break;
        }
        text = next;
    }
    return { text, truncated };
};

export const wikibooksTools = [
    [
        "wikibooks_search",
        "Search Wikibooks for textbooks and how-to guides. Returns matching pages with title, page id, a plain-text snippet, the opening text from the page (at most 2000 characters) and the page URL. Wikibooks holds learning material — use it for how to do something, not for encyclopedia facts.",
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
                `https://en.wikibooks.org/w/api.php?${new URLSearchParams({
                    action: "query",
                    list: "search",
                    srsearch: q,
                    srnamespace: "0",
                    srlimit: String(n),
                    format: "json",
                })}`,
            );
            if (!data?.query?.search || !Array.isArray(data.query.search))
                throw new Error("Unexpected Wikibooks response");
            const hits = data.query.search.slice(0, n);
            const results = await Promise.all(
                hits.map(async (hit) => {
                    // A hit that cannot be read keeps its snippet and URL
                    // with text null, instead of failing the other results.
                    let text = null;
                    let truncated = false;
                    try {
                        const extracted = await fetchJson(
                            `https://en.wikibooks.org/w/api.php?${new URLSearchParams(
                                {
                                    action: "query",
                                    prop: "extracts",
                                    explaintext: "1",
                                    titles: hit.title,
                                    format: "json",
                                },
                            )}`,
                        );
                        const page = Object.values(
                            extracted?.query?.pages ?? {},
                        )[0];
                        if (page?.extract) {
                            ({ text, truncated } = cleanText(page.extract));
                        }
                    } catch {
                        // Keep snippet and URL with text null.
                    }
                    return {
                        title: hit.title,
                        pageid: hit.pageid,
                        snippet: cleanSnippet(hit.snippet),
                        text,
                        truncated,
                        url: `https://en.wikibooks.org/wiki/${encodeURIComponent(hit.title)}`,
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
