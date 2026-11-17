import { z } from "zod";

// PubChem PUG REST is public NCBI data; NCBI asks for at most 5 requests/second.
const API_ROOT = "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound";
const PROPERTIES =
    "Title,IUPACName,MolecularFormula,MolecularWeight,ExactMass,SMILES,InChIKey,XLogP,TPSA,HBondDonorCount,HBondAcceptorCount,Charge";

export const pubChemTools = [
    [
        "pubchem_compound",
        "Look up chemical compounds in PubChem by common name, CID or InChIKey. Returns each match's CID, title, IUPAC name, formula, molecular and exact mass, SMILES, InChIKey, XLogP, polar surface area, hydrogen-bond donors/acceptors, charge and PubChem page. Names can match several compounds (e.g. isomers); at most `limit` are returned.",
        {
            query: z
                .string()
                .trim()
                .min(1)
                .max(200)
                .describe(
                    "Compound name (`caffeine`), CID (`2519`) or InChIKey (`RYYVLZVUVIJVGH-UHFFFAOYSA-N`)",
                ),
            by: z
                .enum(["name", "cid", "inchikey"])
                .default("name")
                .describe("What `query` is"),
            limit: z.number().int().min(1).max(10).default(5),
        },
        async ({ query, by, limit }, fetchJson) => {
            if (by === "cid" && !/^[1-9]\d{0,11}$/.test(query))
                throw new Error("CID must be a positive integer");
            if (by === "inchikey" && !/^[A-Z]{14}-[A-Z]{10}-[A-Z]$/.test(query))
                throw new Error(
                    "InChIKey must look like XXXXXXXXXXXXXX-XXXXXXXXXX-X",
                );
            const data = await fetchJson(
                `${API_ROOT}/${by}/${encodeURIComponent(query)}/property/${PROPERTIES}/JSON`,
            );
            const compounds = data.PropertyTable.Properties.slice(0, limit);
            return {
                total: data.PropertyTable.Properties.length,
                compounds: compounds.map((c) => ({
                    ...c,
                    MolecularWeight: Number(c.MolecularWeight),
                    ExactMass: Number(c.ExactMass),
                    url: `https://pubchem.ncbi.nlm.nih.gov/compound/${c.CID}`,
                })),
            };
        },
    ],
];
