// Human Protein Atlas gene search.
//
// The Atlas answers with a gzip *file* (Content-Type: application/gzip, no
// Content-Encoding header), so a plain fetch never auto-decompresses it — the
// shared fetchJson would try to JSON.parse raw gzip bytes and fail. This tool
// fetches the bytes and gunzips them by hand with DecompressionStream.
import { z } from "zod";

const API_ROOT = "https://www.proteinatlas.org/api/search_download.php";
const MAX_BYTES = 512 * 1024;
const SYNONYM_LIMIT = 10;

async function fetchHpaJson(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    let response;
    try {
        response = await fetch(url, {
            headers: {
                "User-Agent":
                    "Pollinations-Research/0.1 (hello@pollinations.ai)",
                Accept: "application/json",
            },
            redirect: "follow",
            signal: controller.signal,
        });
        if (!response.ok)
            throw new Error(
                `proteinatlas.org returned HTTP ${response.status}${response.status === 429 ? "; rate limited, retry later" : ""}.`,
            );
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength > MAX_BYTES)
            throw new Error(
                "Source response exceeds 512 KiB; narrow the query.",
            );
        let text;
        try {
            text = await new Response(
                new Blob([bytes])
                    .stream()
                    .pipeThrough(new DecompressionStream("gzip")),
            ).text();
        } catch {
            throw new Error(
                "Human Protein Atlas returned a response that could not be decompressed.",
            );
        }
        if (text.length > MAX_BYTES)
            throw new Error(
                "Source response exceeds 512 KiB; narrow the query.",
            );
        try {
            return JSON.parse(text);
        } catch {
            throw new Error(
                "Human Protein Atlas returned a response that could not be parsed.",
            );
        }
    } finally {
        controller.abort();
        clearTimeout(timer);
        await response?.body?.cancel().catch(() => {});
    }
}

function geneSummary(record) {
    return {
        symbol: record.Gene ?? null,
        description: record["Gene description"] ?? null,
        synonyms: Array.isArray(record["Gene synonym"])
            ? record["Gene synonym"].slice(0, SYNONYM_LIMIT)
            : [],
    };
}

export const hpaTools = [
    [
        "hpa_gene",
        "Search the Human Protein Atlas for genes by symbol or name. Returns the gene symbol, a short description, and up to 10 synonyms per gene. Results are prefix matches in the order the Atlas returns them, so TP53 also matches TP53INP1 and TP63.",
        {
            gene: z
                .string()
                .min(1)
                .max(200)
                .describe("Gene symbol or name, for example TP53."),
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe("Maximum number of genes to return."),
        },
        async ({ gene, limit }) => {
            const name = gene?.trim();
            if (!name) throw new Error("Gene symbol must not be blank.");
            const n =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 5;
            const url = new URL(API_ROOT);
            url.searchParams.set("search", name);
            url.searchParams.set("format", "json");
            url.searchParams.set("columns", "g,gs,gd");
            const data = await fetchHpaJson(url);
            if (!Array.isArray(data))
                throw new Error("Unexpected Human Protein Atlas response.");
            return {
                gene: name,
                total: data.length,
                genes: data.slice(0, n).map(geneSummary),
            };
        },
    ],
];
