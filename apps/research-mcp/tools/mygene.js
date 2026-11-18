import { z } from "zod";
import { fetchJson } from "../fetch.js";

const API_ROOT = "https://mygene.info/v3/query";

function geneSummary(hit) {
    return {
        symbol: hit.symbol ?? null,
        name: hit.name ?? null,
        entrez_id: hit.entrezgene ?? null,
        taxid: hit.taxid ?? null,
    };
}

export const mygeneTools = [
    [
        "mygene_gene",
        "Look up a gene by symbol or name on MyGene.info. Returns matching genes with symbol, full name, Entrez gene id and NCBI taxonomy id. Matches span species — use taxid to tell human (9606) from other organisms.",
        {
            query: z
                .string()
                .min(1)
                .max(200)
                .describe("Gene symbol or name, for example TP53 or BRCA1."),
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe("Maximum number of genes to return."),
        },
        async ({ query, limit }) => {
            const trimmed = query.trim();
            if (!trimmed) throw new Error("Provide a gene symbol or name.");
            const n =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 5;
            const url = new URL(API_ROOT);
            url.searchParams.set("q", trimmed);
            url.searchParams.set("size", String(n));
            const data = await fetchJson(url);
            if (!Array.isArray(data.hits))
                throw new Error("Unexpected MyGene.info response.");
            return {
                query: trimmed,
                total: data.total ?? 0,
                genes: data.hits.slice(0, n).map(geneSummary),
            };
        },
    ],
];
