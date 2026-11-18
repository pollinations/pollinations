import { z } from "zod";
import { fetchText } from "../fetch.js";

const API_ROOT = "https://cactus.nci.nih.gov/chemical/structure";
const FORMATS = ["inchi", "smiles", "iupac_name", "formula"];

export const cactusTools = [
    [
        "chemical_structure",
        "Convert a chemical name to a structure representation with the NCI/CADD Chemical Identifier Resolver: InChI by default, or SMILES, IUPAC name, or molecular formula on request. One fetch per call, no key needed. This converts a name to a structure string; it does not look up compound records (that is PubChem's job).",
        {
            name: z
                .string()
                .min(1)
                .max(200)
                .describe(
                    "Chemical name, e.g. 'aspirin' or 'acetylsalicylic acid'",
                ),
            format: z
                .enum(FORMATS)
                .default("inchi")
                .describe(
                    "Structure representation to return (inchi, smiles, iupac_name, or formula; default inchi)",
                ),
        },
        async ({ name, format }) => {
            const trimmed = name.trim();
            if (!trimmed) throw new Error("name must not be blank");
            const fmt = FORMATS.includes(format) ? format : "inchi";
            const url = `${API_ROOT}/${encodeURIComponent(trimmed)}/${fmt}`;
            let text;
            try {
                text = await fetchText(url, "text/plain");
            } catch (error) {
                // The resolver answers an unknown name with HTTP 500 and a
                // "Page not found (404)" HTML page, not a 404.
                if (error?.message?.includes("HTTP 500"))
                    throw new Error(
                        `No chemical structure found for "${trimmed}"`,
                    );
                throw error;
            }
            const structure = text.trim();
            if (!structure)
                throw new Error(`No chemical structure found for "${trimmed}"`);
            return { name: trimmed, format: fmt, structure, url };
        },
    ],
];
