// Socrata open-data catalog search — keyless. The caller's Pollinations key
// authenticates the proxy. Socrata is public, so the key is never forwarded
// upstream. This tool finds datasets (metadata only); it does not query the
// data inside them.
import { z } from "zod";
import { fetchJson } from "../fetch.js";

const API_ROOT = "https://api.us.socrata.com/api/catalog/v1";
const MAX_DESCRIPTION = 400;

// Strip HTML tags one character at a time. A single regex pass can leave a
// tag behind when tags nest (e.g. `<<script>` survives `<[^>]*>` as
// `<script>`), so drop everything between `<` and the next `>` instead. A
// `<` with no closing `>` swallows the rest of the string, which is the safe
// direction — no markup survives. A lone `>` outside a tag is kept, as text.
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

const cleanDescription = (text) => {
    const plain = stripTags(text).replace(/\s+/g, " ").trim();
    if (!plain) return null;
    return plain.length > MAX_DESCRIPTION
        ? `${plain.slice(0, MAX_DESCRIPTION - 3)}...`
        : plain;
};

function formatDataset(result) {
    const resource = result?.resource ?? {};
    const metadata = result?.metadata ?? {};
    return {
        id: resource.id ?? null,
        name: resource.name ?? null,
        domain: metadata.domain ?? null,
        description: cleanDescription(resource.description),
        type: resource.type ?? null,
        link: result?.link ?? result?.permalink ?? null,
    };
}

export const socrataTools = [
    [
        "socrata_search",
        "Search the Socrata open-data catalog for public datasets on a topic: city, state, and federal open data. Returns each dataset's name, id, publishing domain, description, type, and link. Metadata only — it finds datasets, it does not query the data inside them. No key needed.",
        {
            query: z
                .string()
                .min(1)
                .max(200)
                .describe(
                    "Search terms, for example police calls or building permits.",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe("Maximum number of results to return."),
        },
        async ({ query, limit }) => {
            const term = String(query ?? "").trim();
            if (term.length === 0) {
                throw new Error("Query must not be empty.");
            }
            const count =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 5;
            const url = new URL(API_ROOT);
            url.searchParams.set("q", term);
            url.searchParams.set("limit", String(count));
            const data = await fetchJson(url);
            if (!data || !Array.isArray(data.results)) {
                throw new Error("Socrata returned an unexpected response.");
            }
            return {
                query: term,
                total: data.resultSetSize ?? data.results.length,
                datasets: data.results.slice(0, count).map(formatDataset),
            };
        },
    ],
];
