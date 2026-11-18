// MedlinePlus consumer health topics (National Library of Medicine). Keyless.
//
// The search API answers XML, not JSON, and the fetch is heavy (56 KB for
// ten results), so the tool always caps the fetch with `retmax` — two
// results cost about 16 KB instead. Each document carries a title and a
// short snippet; the long `FullSummary` (up to ~9 KB per topic) is never
// returned. Titles and snippets arrive entity-encoded with search-match
// markup (`&lt;span class="qt0"&gt;diabetes&lt;/span&gt;`), so they are
// decoded and stripped to plain text. MedlinePlus is consumer health
// information — use it for what a condition is and how it is managed, not
// for gene records (ncbi_gene) or variant–disease associations (clinvar).
import { z } from "zod";
import { fetchText } from "../fetch.js";
import { decodeEntities } from "./europe-pmc.js";

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

// Plain text for a title or snippet: decode entities FIRST — the markup
// arrives entity-encoded (`&lt;span class="qt0"&gt;`), so stripping before
// decoding would leave literal tags behind — then strip the search-match
// spans and collapse whitespace. `\u200b` is not matched by `\s`, so it is
// collapsed explicitly.
const cleanText = (text) =>
    stripTags(decodeEntities(text))
        .replace(/[\s\u200b]+/g, " ")
        .trim();

const MAX_SNIPPET = 500;

const content = (block, name) => {
    const match = block.match(
        new RegExp(`<content name="${name}">([\\s\\S]*?)</content>`),
    );
    return match ? match[1] : null;
};

function parse(xml) {
    const error = xml.match(/<error-msg>([\s\S]*?)<\/error-msg>/);
    if (error)
        throw new Error(
            `MedlinePlus: ${cleanText(error[1]).slice(0, 200) || "search failed"}`,
        );
    const countMatch = xml.match(/<count>(\d+)<\/count>/);
    if (!countMatch) throw new Error("MedlinePlus: unexpected response");
    const total = Number(countMatch[1]);
    const topics = [
        ...xml.matchAll(
            /<document rank="(\d+)" url="([^"]+)">([\s\S]*?)<\/document>/g,
        ),
    ].map(([, rank, url, block]) => {
        const snippet = cleanText(content(block, "snippet") ?? "");
        return {
            rank: Number(rank),
            title: cleanText(content(block, "title") ?? ""),
            snippet: snippet.slice(0, MAX_SNIPPET),
            truncated: snippet.length > MAX_SNIPPET,
            url,
        };
    });
    return { total, topics };
}

export const medlinePlusTools = [
    [
        "medlineplus_topics",
        "Search MedlinePlus consumer health topics. Returns matching topics with title, a plain-text snippet and the MedlinePlus page URL. MedlinePlus is consumer health information — use it for what a condition is and how it is managed, not for gene records or variant–disease associations.",
        {
            query: z.string().trim().min(1).max(200),
            limit: z.number().int().min(1).max(10).default(5),
        },
        async ({ query, limit }) => {
            const q = String(query ?? "").trim();
            if (!q) throw new Error("query must not be blank");
            const n =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 5;
            const xml = await fetchText(
                `https://wsearch.nlm.nih.gov/ws/query?${new URLSearchParams({
                    db: "healthTopics",
                    term: q,
                    retmax: String(n),
                })}`,
                "application/xml",
            );
            const { total, topics } = parse(xml);
            return { query: q, total, topics };
        },
    ],
];
