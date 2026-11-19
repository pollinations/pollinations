import { z } from "zod";

// UniProt REST is public (CC BY 4.0) and needs no key.
const API_ROOT = "https://rest.uniprot.org/uniprotkb/search";
const FUNCTION_LIMIT = 1_500;

function proteinName(description) {
    return (
        description?.recommendedName?.fullName?.value ??
        description?.submissionNames?.[0]?.fullName?.value ??
        null
    );
}

export const uniProtTools = [
    [
        "uniprot_search",
        "Search UniProtKB proteins by name, gene, accession or UniProt query syntax (e.g. `gene_exact:TP53`, `insulin AND organism_id:9606`). Returns each protein's accession, name, gene names, organism, sequence length, curated function summary and UniProt page. Reviewed Swiss-Prot entries only unless `reviewed` is false.",
        {
            query: z.string().trim().min(1).max(300),
            organism: z
                .number()
                .int()
                .positive()
                .optional()
                .describe(
                    "NCBI taxonomy ID, e.g. 9606 for human, 10090 for mouse",
                ),
            reviewed: z.boolean().default(true),
            limit: z.number().int().min(1).max(10).default(5),
        },
        async ({ query, organism, reviewed, limit }, fetchJson) => {
            const terms = [`(${query})`];
            if (organism) terms.push(`organism_id:${organism}`);
            if (reviewed) terms.push("reviewed:true");
            const url = new URL(API_ROOT);
            url.search = new URLSearchParams({
                query: terms.join(" AND "),
                fields: "accession,protein_name,gene_names,organism_name,length,cc_function",
                size: String(limit),
                format: "json",
            }).toString();
            const { results } = await fetchJson(url);
            return {
                proteins: results.map((entry) => {
                    const fn = (entry.comments ?? [])
                        .filter((c) => c.commentType === "FUNCTION")
                        .flatMap((c) => c.texts ?? [])
                        .map((t) => t.value)
                        .join(" ");
                    return {
                        accession: entry.primaryAccession,
                        reviewed:
                            entry.entryType?.includes("Swiss-Prot") ?? false,
                        name: proteinName(entry.proteinDescription),
                        genes: (entry.genes ?? [])
                            .map((g) => g.geneName?.value)
                            .filter(Boolean),
                        organism: entry.organism?.scientificName ?? null,
                        taxonId: entry.organism?.taxonId ?? null,
                        length: entry.sequence?.length ?? null,
                        function: fn ? fn.slice(0, FUNCTION_LIMIT) : null,
                        functionTruncated: fn.length > FUNCTION_LIMIT,
                        url: `https://www.uniprot.org/uniprotkb/${entry.primaryAccession}`,
                    };
                }),
            };
        },
    ],
];
