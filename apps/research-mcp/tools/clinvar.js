import { z } from "zod";

const EUTILS_ROOT = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
// NCBI asks callers to identify themselves; the contact is Pollinations'
// public support address, already the contact in crossref.js and fetch.js.
const IDENT = "tool=pollinations-research&email=hello@pollinations.ai";
const XREF_LIMIT = 5;

function formatVariant(record) {
    if (!record || typeof record !== "object") return null;
    const measure = Array.isArray(record.variation_set)
        ? record.variation_set[0]
        : null;
    const xrefs = Array.isArray(measure?.variation_xrefs)
        ? measure.variation_xrefs
              .slice(0, XREF_LIMIT)
              .map((x) => `${x.db_source}:${x.db_id}`)
              .filter(Boolean)
        : [];
    return {
        accession: record.accession ?? null,
        title: record.title ?? null,
        variation_type: measure?.variant_type ?? record.obj_type ?? null,
        significance: record.germline_classification?.description ?? null,
        xrefs,
    };
}

export const clinvarTools = [
    [
        "clinvar_variant",
        "Search ClinVar for genetic variants by gene or variant name, returning the ClinVar accession, HGVS title, variation type, clinical significance and cross-references. Results come back in NCBI's default order (most recent first), not ranked by closeness to the term.",
        {
            term: z
                .string()
                .min(1)
                .max(200)
                .describe("Gene or variant to search for, for example BRCA1."),
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe(
                    "Maximum number of variants to return (1-10, default 5).",
                ),
        },
        async ({ term, limit }, fetchJson) => {
            const query = term.trim();
            if (!query) throw new Error("Search term must not be empty.");
            const n =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 5;
            const searchUrl =
                `${EUTILS_ROOT}/esearch.fcgi?db=clinvar` +
                `&term=${encodeURIComponent(query)}&retmode=json` +
                `&retmax=${n}&${IDENT}`;
            const search = await fetchJson(searchUrl);
            const result = search?.esearchresult ?? {};
            const total = Number.parseInt(result.count ?? "0", 10) || 0;
            const ids = Array.isArray(result.idlist) ? result.idlist : [];
            if (ids.length === 0) return { term: query, total, variants: [] };
            const summaryUrl =
                `${EUTILS_ROOT}/esummary.fcgi?db=clinvar` +
                `&id=${ids.map(encodeURIComponent).join(",")}` +
                `&retmode=json&${IDENT}`;
            const summary = await fetchJson(summaryUrl);
            const docs = summary?.result ?? {};
            const uids = Array.isArray(docs.uids) ? docs.uids : ids;
            return {
                term: query,
                total,
                variants: uids
                    .map((uid) => formatVariant(docs[uid]))
                    .filter(Boolean),
            };
        },
    ],
];
