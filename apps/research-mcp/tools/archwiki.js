// Arch Wiki search. Keyless.
//
// Search returns page titles only, so each hit is read with a second fetch.
// The TextExtracts extension is not installed here — `prop=extracts` answers
// with an empty extract and a warning that the parameter is unrecognized —
// so the tool reads the lead section instead: `action=parse&prop=text&
// section=0`, the same shape Wikisource uses for its chapter pages. The
// lead section is small (1–5 KB of HTML) and carries the page's opening
// paragraphs, which is what a search answer needs. Redirects are followed
// (`redirects=1`); without it a redirect page answers "Redirect to: …" and
// no text. Arch Wiki holds Arch Linux documentation — use it for how to do
// something on Arch, not for encyclopedia facts (wikipedia_search) or full
// public-domain texts (wikisource_search).
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

// Drop HTML comments and the "Related articles" navigation box from parsed
// section-0 HTML before the text is read. The nav box is a
// `<div class="archwiki-template-meta-related-articles">` at the top of most
// pages; its links are navigation, not content. Divs are skipped with a
// depth count, never a regex, so nested markup cannot leave a tag behind.
const dropMetaDivs = (html) => {
    const src = String(html ?? "");
    let out = "";
    let i = 0;
    while (i < src.length) {
        if (src.startsWith("<!--", i)) {
            const end = src.indexOf("-->", i + 4);
            i = end === -1 ? src.length : end + 3;
            continue;
        }
        const next = src[i + 4] ?? "";
        if (
            src.slice(i, i + 4).toLowerCase() === "<div" &&
            (next === " " || next === ">" || next === "/")
        ) {
            const tagEnd = src.indexOf(">", i);
            if (tagEnd === -1) break;
            if (src.slice(i, tagEnd + 1).includes("archwiki-template-meta")) {
                // Skip to the matching close, counting nested divs.
                let depth = 1;
                let j = tagEnd + 1;
                while (j < src.length && depth > 0) {
                    const ch = src[j + 4] ?? "";
                    if (
                        src.slice(j, j + 4).toLowerCase() === "<div" &&
                        (ch === " " || ch === ">" || ch === "/")
                    ) {
                        const close = src.indexOf(">", j);
                        if (close === -1) {
                            j = src.length;
                            break;
                        }
                        depth++;
                        j = close + 1;
                    } else if (src.slice(j, j + 6).toLowerCase() === "</div>") {
                        depth--;
                        j += 6;
                    } else {
                        j++;
                    }
                }
                i = j;
                continue;
            }
        }
        out += src[i];
        i++;
    }
    return out;
};

// The opening text of a page's lead section: the navigation box and parser
// comments dropped, tags stripped char by char, entities decoded,
// whitespace collapsed. Returns null when nothing readable survives.
const cleanText = (html) => {
    const paragraphs = decodeEntities(stripTags(dropMetaDivs(html)))
        .split(/\n\s*\n/)
        .map((paragraph) => paragraph.replace(/[\s\u200b]+/g, " ").trim())
        .filter((paragraph) => paragraph.length > 0);
    if (paragraphs.length === 0) return { text: null, truncated: false };
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

const pageUrl = (title) =>
    `https://wiki.archlinux.org/title/${title
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`;

export const archwikiTools = [
    [
        "archwiki_search",
        "Search the Arch Wiki for Arch Linux documentation. Returns matching pages with title, page id, a plain-text snippet, the opening text from the page's lead section (at most 2000 characters) and the page URL. Arch Wiki holds how-to and reference docs for Arch Linux — use it for doing something on Arch, not for encyclopedia facts.",
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
                `https://wiki.archlinux.org/w/api.php?${new URLSearchParams({
                    action: "query",
                    list: "search",
                    srsearch: q,
                    srnamespace: "0",
                    srlimit: String(n),
                    format: "json",
                })}`,
            );
            if (!data?.query?.search || !Array.isArray(data.query.search))
                throw new Error("Unexpected Arch Wiki response");
            const hits = data.query.search.slice(0, n);
            const results = await Promise.all(
                hits.map(async (hit) => {
                    // A hit that cannot be read keeps its snippet and URL
                    // with text null, instead of failing the other results.
                    let text = null;
                    let truncated = false;
                    try {
                        const parsed = await fetchJson(
                            `https://wiki.archlinux.org/w/api.php?${new URLSearchParams(
                                {
                                    action: "parse",
                                    prop: "text",
                                    section: "0",
                                    redirects: "1",
                                    format: "json",
                                    page: hit.title,
                                },
                            )}`,
                        );
                        const html = parsed?.parse?.text?.["*"];
                        if (html) {
                            ({ text, truncated } = cleanText(html));
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
                        url: pageUrl(hit.title),
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
