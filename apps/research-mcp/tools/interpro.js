// EBI InterPro protein domain entry lookup. Keyless, one fetch per call.
// Unknown accessions answer HTTP 204 with an empty body, not a 404, so the
// handler treats an empty response as a missing entry. Descriptions arrive
// as HTML with [[cite:...]] markers and are returned as plain text.
import { z } from "zod";
import { fetchText } from "../fetch.js";

const API = "https://www.ebi.ac.uk/interpro/api/entry/interpro";

const cleanDescription = (text) => {
    const plain = String(text ?? "")
        .replace(/<[^>]*>/g, "")
        .replace(/\[\[cite:.*?\]\]/g, "")
        .replace(/\s+/g, " ")
        .replace(/ \./g, ".")
        .trim();
    if (!plain) return null;
    return plain.length > 500 ? `${plain.slice(0, 497)}...` : plain;
};

export const interproTools = [
    [
        "interpro_entry",
        "Look up a protein domain entry in EBI InterPro by accession: name, type, plain-text description and member-database signatures (Pfam, SMART, CDD). For example IPR000001 (Kringle).",
        {
            accession: z
                .string()
                .trim()
                .regex(/^IPR\d{6}$/i)
                .describe(
                    "InterPro accession such as IPR000001 (Kringle domain).",
                ),
        },
        async ({ accession }) => {
            const clean = String(accession ?? "")
                .trim()
                .toUpperCase();
            if (!/^IPR\d{6}$/.test(clean))
                throw new Error(
                    "Provide an InterPro accession such as IPR000001.",
                );
            const text = await fetchText(`${API}/${clean}/?page_size=2`);
            if (!text.trim())
                throw new Error(`No InterPro entry found for ${clean}.`);
            let data;
            try {
                data = JSON.parse(text);
            } catch {
                throw new Error(`No InterPro entry found for ${clean}.`);
            }
            const metadata = data?.metadata;
            if (!metadata?.accession)
                throw new Error(`No InterPro entry found for ${clean}.`);
            const memberDatabases = {};
            for (const [db, entries] of Object.entries(
                metadata.member_databases ?? {},
            )) {
                const signatures = Object.entries(entries ?? {}).map(
                    ([signature, name]) => ({ accession: signature, name }),
                );
                if (signatures.length > 0) memberDatabases[db] = signatures;
            }
            return {
                accession: metadata.accession,
                name: metadata.name?.name ?? null,
                type: metadata.type ?? null,
                description: cleanDescription(metadata.description?.[0]?.text),
                member_databases: memberDatabases,
            };
        },
    ],
];
