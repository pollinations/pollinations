import { z } from "zod";

const API_ROOT = "https://string-db.org/api/json/network";

function formatEdge(edge) {
    return {
        protein_a: edge.preferredName_A ?? null,
        string_id_a: edge.stringId_A ?? null,
        protein_b: edge.preferredName_B ?? null,
        string_id_b: edge.stringId_B ?? null,
        score: typeof edge.score === "number" ? edge.score : null,
    };
}

export const stringTools = [
    [
        "string_network",
        "Look up a protein's interaction network on the STRING database: give a protein name or symbol and an NCBI taxon id and get the strongest interaction edges with combined scores.",
        {
            protein: z
                .string()
                .min(1)
                .max(200)
                .describe("Protein name or symbol, e.g. TP53"),
            species: z
                .number()
                .int()
                .min(1)
                .default(9606)
                .describe("NCBI taxon id (default 9606, human)"),
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe(
                    "Maximum number of edges to return (1-10, default 5)",
                ),
        },
        async ({ protein, species = 9606, limit = 5 }, fetchJson) => {
            const name = String(protein ?? "").trim();
            if (!name) throw new Error("protein must not be blank.");
            const taxon =
                Number.isInteger(species) && species >= 1 ? species : 9606;
            const n =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 5;
            let data;
            try {
                data = await fetchJson(
                    `${API_ROOT}?identifiers=${encodeURIComponent(name)}&species=${taxon}`,
                );
            } catch (error) {
                if (/HTTP 404/.test(error.message))
                    throw new Error(
                        `Protein not found: ${name} in taxon ${taxon}.`,
                    );
                throw error;
            }
            if (!Array.isArray(data))
                throw new Error("Unexpected STRING response.");
            const edges = data
                .map(formatEdge)
                .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
            return {
                protein: name,
                species: taxon,
                total: edges.length,
                edges: edges.slice(0, n),
            };
        },
    ],
];
