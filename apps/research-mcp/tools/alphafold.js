import { z } from "zod";
import { fetchJson } from "../fetch.js";

const API_ROOT = "https://alphafold.ebi.ac.uk/api/prediction";
// UniProt accessions are 6 or 10 characters; the handler re-checks the shape
// because zod only applies through the MCP server.
const ACCESSION = /^[A-Za-z0-9]{6}(?:[A-Za-z0-9]{4})?$/;

function predictionSummary(entry, accession) {
    return {
        uniprot: entry.uniprotAccession ?? accession,
        model: entry.modelEntityId ?? null,
        mean_plddt: entry.globalMetricValue ?? null,
        fraction_plddt_very_high: entry.fractionPlddtVeryHigh ?? null,
        fraction_plddt_confident: entry.fractionPlddtConfident ?? null,
        fraction_plddt_low: entry.fractionPlddtLow ?? null,
        fraction_plddt_very_low: entry.fractionPlddtVeryLow ?? null,
        latest_version: entry.latestVersion ?? null,
        model_created: entry.modelCreatedDate ?? null,
    };
}

export const alphafoldTools = [
    [
        "alphafold_prediction",
        "Look up the AlphaFold structure prediction for a UniProt protein accession: model id, mean pLDDT confidence and the confidence fractions. The amino-acid sequence is not returned.",
        {
            uniprot: z
                .string()
                .min(6)
                .max(10)
                .regex(ACCESSION)
                .describe(
                    "UniProt accession, for example P00533 (human EGFR).",
                ),
        },
        async ({ uniprot }) => {
            const accession = uniprot.trim().toUpperCase();
            if (!ACCESSION.test(accession)) {
                throw new Error(
                    `${uniprot} is not a UniProt accession (6 or 10 characters).`,
                );
            }
            let data;
            try {
                data = await fetchJson(
                    `${API_ROOT}/${encodeURIComponent(accession)}`,
                );
            } catch (error) {
                throw new Error(
                    `No AlphaFold prediction for ${accession}: ${error.message}`,
                );
            }
            const entry = Array.isArray(data) ? data[0] : null;
            if (!entry) {
                throw new Error(`No AlphaFold prediction for ${accession}.`);
            }
            return predictionSummary(entry, accession);
        },
    ],
];
