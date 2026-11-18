import { z } from "zod";

const API_ROOT = "https://www.ebi.ac.uk/QuickGO/services/annotation/search";
const DEFAULT_LIMIT = 5;

function normalizeProtein(protein) {
    const trimmed = protein.trim();
    if (!trimmed) throw new Error("protein must not be blank.");
    if (!trimmed.includes(":")) {
        // A bare entry name like P53_HUMAN is not a valid gene product id —
        // QuickGO answers it with a 400, so reject it before any fetch.
        if (trimmed.includes("_"))
            throw new Error(
                "Use a UniProt accession like P04637, not an entry name like P53_HUMAN.",
            );
        return `UniProtKB:${trimmed.toUpperCase()}`;
    }
    return trimmed;
}

function formatAnnotation(item) {
    return {
        geneProductId: item.geneProductId ?? null,
        symbol: item.symbol ?? null,
        qualifier: item.qualifier ?? null,
        goId: item.goId ?? null,
        goAspect: item.goAspect ?? null,
        evidenceCode: item.evidenceCode ?? null,
        reference: item.reference ?? null,
        assignedBy: item.assignedBy ?? null,
    };
}

export const quickGoTools = [
    [
        "go_annotations",
        "Look up Gene Ontology (GO) annotations for a protein by UniProt accession via EBI QuickGO: GO term, qualifier, evidence code and reference for each annotation. A bare accession like P04637 is accepted; entry names like P53_HUMAN are not.",
        {
            protein: z
                .string()
                .min(1)
                .max(100)
                .describe(
                    "UniProt accession (e.g. 'P04637') or a prefixed gene product id (e.g. 'UniProtKB:P04637')",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(DEFAULT_LIMIT)
                .describe(
                    "Maximum number of annotations to return (1-10, default 5)",
                ),
        },
        async ({ protein, limit }, fetchJson) => {
            const geneProductId = normalizeProtein(protein);
            const perPage =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : DEFAULT_LIMIT;
            const url = `${API_ROOT}?geneProductId=${encodeURIComponent(geneProductId)}&limit=${perPage}`;
            let data;
            try {
                data = await fetchJson(url);
            } catch (error) {
                // The request is fully tool-constructed, so a 400 can only
                // mean QuickGO does not recognise the id.
                if (String(error?.message).includes("returned HTTP 400"))
                    throw new Error(
                        `QuickGO does not recognise ${protein.trim()} as a gene product id — use a UniProt accession like P04637.`,
                    );
                throw error;
            }
            if (!Array.isArray(data?.results))
                throw new Error("QuickGO returned an unexpected response.");
            return {
                protein: geneProductId,
                total: data.numberOfHits ?? data.results.length,
                annotations: data.results.map(formatAnnotation),
            };
        },
    ],
];
