import { z } from "zod";

const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const DEFAULT_ORGANISM = "Homo sapiens";
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 25;
const SUMMARY_LIMIT = 500;
const ALIAS_LIMIT = 5;

function cleanString(val) {
    if (!val) return "";
    return String(val).replace(/\s+/g, " ").trim();
}

function formatGene(record) {
    const summary = cleanString(record.summary);
    const aliases = cleanString(record.otheraliases)
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean);
    return {
        geneId: Number(record.uid),
        symbol: record.name ?? null,
        description: cleanString(record.description) || null,
        chromosome: record.chromosome || null,
        mapLocation: record.maplocation || null,
        organism: record.organism?.scientificname ?? null,
        summary: summary ? summary.slice(0, SUMMARY_LIMIT) : null,
        summaryTruncated: summary.length > SUMMARY_LIMIT,
        aliases: aliases.slice(0, ALIAS_LIMIT),
        aliasesCount: aliases.length,
    };
}

export const ncbiTools = [
    [
        "ncbi_gene",
        "Look up genes in NCBI Gene by gene symbol — what a gene is, where it sits in the genome and what it does. Give a gene symbol and it returns matching genes with NCBI gene id, symbol, description, chromosome, map location, organism and a short summary. Searches one organism at a time (human by default); the symbol is matched against the Gene Name field, so a bare symbol like BRCA1 does not return the tens of thousands of free-text hits. No key needed.",
        {
            gene: z
                .string()
                .min(1)
                .max(100)
                .describe(
                    "Gene symbol, e.g. BRCA1 (matched against the Gene Name field)",
                ),
            organism: z
                .string()
                .min(1)
                .max(100)
                .default(DEFAULT_ORGANISM)
                .describe(
                    "Organism scientific name, e.g. Homo sapiens or Mus musculus (default Homo sapiens)",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(MAX_LIMIT)
                .default(DEFAULT_LIMIT)
                .describe(
                    "Maximum number of genes to return (1-25, default 5)",
                ),
        },
        async (
            { gene, organism = DEFAULT_ORGANISM, limit = DEFAULT_LIMIT },
            fetchJson,
        ) => {
            const trimmedGene = gene?.trim();
            if (!trimmedGene) throw new Error("Provide a gene symbol.");
            const trimmedOrganism = organism?.trim() || DEFAULT_ORGANISM;
            if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT)
                throw new Error(`limit must be between 1 and ${MAX_LIMIT}`);
            // The [Gene Name] qualifier is load-bearing: a bare BRCA1 term
            // returns 38,286 free-text hits, and without the organism
            // qualifier the same symbol returns 692 genes across species.
            const term = `${trimmedGene}[Gene Name] AND "${trimmedOrganism}"[Organism]`;
            const search = await fetchJson(
                `${EUTILS}/esearch.fcgi?db=gene&term=${encodeURIComponent(term)}&retmode=json&retmax=${limit}`,
            );
            const ids = search?.esearchresult?.idlist ?? [];
            const total =
                Number.parseInt(search?.esearchresult?.count ?? "0", 10) || 0;
            if (ids.length === 0)
                return {
                    gene: trimmedGene,
                    organism: trimmedOrganism,
                    total: 0,
                    genes: [],
                };
            const summary = await fetchJson(
                `${EUTILS}/esummary.fcgi?db=gene&id=${ids.join(",")}&retmode=json`,
            );
            const records = summary?.result ?? {};
            const genes = ids
                .map((id) => records[id])
                .filter(Boolean)
                .map(formatGene);
            return {
                gene: trimmedGene,
                organism: trimmedOrganism,
                total,
                genes,
            };
        },
    ],
];
