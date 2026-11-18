import { z } from "zod";

const API_ROOT = "https://www.sefaria.org/api/texts";
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 10;

// Drop an element (opening tag through its matching close tag, content
// included) whose opening tag carries the given class, counting nested opens
// of the same tag. Char-by-char, never a regex: Sefaria's English text
// carries footnote markers and footnote bodies inline, and a plain tag
// strip would leave the footnote prose inside the verse.
function dropClassBlocks(html, tag, className) {
    let out = "";
    let i = 0;
    const openPrefix = `<${tag}`;
    const closeTag = `</${tag}>`;
    while (i < html.length) {
        const at = html.indexOf(openPrefix, i);
        if (at === -1) {
            out += html.slice(i);
            break;
        }
        out += html.slice(i, at);
        const tagEnd = html.indexOf(">", at);
        if (tagEnd === -1) break;
        const opening = html.slice(at, tagEnd + 1);
        if (!opening.includes(`class="${className}"`)) {
            out += opening;
            i = tagEnd + 1;
            continue;
        }
        let depth = 1;
        let j = tagEnd + 1;
        while (j < html.length && depth > 0) {
            const nextOpen = html.indexOf(openPrefix, j);
            const nextClose = html.indexOf(closeTag, j);
            if (nextClose === -1) {
                j = html.length;
                break;
            }
            if (nextOpen !== -1 && nextOpen < nextClose) {
                depth += 1;
                j = nextOpen + openPrefix.length;
            } else {
                depth -= 1;
                j = nextClose + closeTag.length;
            }
        }
        i = j;
    }
    return out;
}

// Strip tags char-by-char (the InterPro parser shape from #20161, never a
// regex). A <br> becomes a space so poetry line breaks do not glue words.
function stripTags(html) {
    let out = "";
    let i = 0;
    while (i < html.length) {
        if (html[i] === "<") {
            const end = html.indexOf(">", i);
            if (end === -1) break;
            const tag = html
                .slice(i + 1, end)
                .trim()
                .toLowerCase();
            if (tag === "br" || tag.startsWith("br ") || tag.startsWith("br/"))
                out += " ";
            i = end + 1;
        } else {
            out += html[i];
            i += 1;
        }
    }
    return out;
}

function decodeEntities(text) {
    const named = {
        amp: "&",
        lt: "<",
        gt: ">",
        quot: '"',
        apos: "'",
        nbsp: " ",
    };
    let out = "";
    let i = 0;
    while (i < text.length) {
        if (text[i] === "&") {
            const end = text.indexOf(";", i);
            if (end !== -1 && end - i <= 10) {
                const entity = text.slice(i + 1, end);
                if (named[entity] !== undefined) {
                    out += named[entity];
                    i = end + 1;
                    continue;
                }
                const numeric = entity.startsWith("&#x")
                    ? Number.parseInt(entity.slice(3), 16)
                    : entity.startsWith("&#")
                      ? Number.parseInt(entity.slice(2), 10)
                      : Number.NaN;
                if (Number.isFinite(numeric)) {
                    out += String.fromCodePoint(numeric);
                    i = end + 1;
                    continue;
                }
            }
        }
        out += text[i];
        i += 1;
    }
    return out;
}

function cleanVerse(raw) {
    const noFootnotes = dropClassBlocks(
        dropClassBlocks(raw, "sup", "footnote-marker"),
        "i",
        "footnote",
    );
    return decodeEntities(stripTags(noFootnotes)).replace(/\s+/g, " ").trim();
}

function flattenText(text) {
    const flat = [];
    const walk = (node) => {
        if (typeof node === "string") flat.push(node);
        else if (Array.isArray(node)) node.forEach(walk);
    };
    walk(text);
    return flat;
}

export const sefariaTools = [
    [
        "sefaria_text",
        "Read a passage from Sefaria's library of Jewish texts (Tanakh, Mishnah, Talmud and more) in English translation. Give a reference like Genesis.1 or Genesis.1.1; returns the verses as plain text, without footnotes. A verse reference still fetches the whole chapter upstream, so the tool slices to the requested verses client-side.",
        {
            ref: z
                .string()
                .min(1)
                .max(200)
                .describe(
                    "Sefaria reference, e.g. 'Genesis.1' for a chapter or 'Genesis.1.1' for one verse",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe(
                    "Maximum number of verses to return (1-10, default 5)",
                ),
        },
        async ({ ref, limit }, fetchJson) => {
            const trimmed = typeof ref === "string" ? ref.trim() : "";
            if (!trimmed) throw new Error("ref must not be blank.");
            const count =
                Number.isInteger(limit) && limit >= 1 && limit <= MAX_LIMIT
                    ? limit
                    : DEFAULT_LIMIT;
            const data = await fetchJson(
                `${API_ROOT}/${encodeURIComponent(trimmed)}?commentary=0`,
            );
            if (data?.error) throw new Error(`Sefaria: ${data.error}`);
            if (!Array.isArray(data?.text))
                throw new Error(`No Sefaria text found for "${trimmed}".`);
            const verses = flattenText(data.text);
            const sections = Array.isArray(data.sections) ? data.sections : [];
            const toSections = Array.isArray(data.toSections)
                ? data.toSections
                : [];
            // Two-level (chapter, verse) refs slice exactly: a verse ref
            // still returns the whole chapter, so the start and end verse
            // come from sections/toSections, not from the payload order.
            let start = 0;
            let end = verses.length;
            if (data.textDepth === 2 && sections.length >= 2) {
                const first = sections[sections.length - 1];
                if (Number.isInteger(first) && first >= 1) {
                    start = Math.min(first - 1, verses.length);
                    end = start + 1;
                    const last = toSections[toSections.length - 1];
                    if (
                        Number.isInteger(last) &&
                        last > first &&
                        last <= verses.length
                    )
                        end = last;
                }
            }
            const picked = verses
                .slice(start, Math.min(end, start + count))
                .map((text, index) => ({
                    verse: start + index + 1,
                    text: cleanVerse(text),
                }));
            return {
                ref: data.ref ?? trimmed,
                book: data.book ?? null,
                type: data.type ?? null,
                categories: data.categories ?? [],
                total: verses.length,
                verses: picked,
                truncated: start + count < end,
                version: data.versionTitle ?? null,
                license: data.license ?? null,
                url: `https://www.sefaria.org/${encodeURIComponent(trimmed)}`,
            };
        },
    ],
];
