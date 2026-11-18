import { z } from "zod";

const EUTILS_ROOT = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
// NCBI asks callers to identify themselves; the contact is Pollinations'
// public support address, already the contact in crossref.js and fetch.js.
const IDENT = "tool=pollinations-research&email=hello@pollinations.ai";

function formatDataset(record) {
    if (!record || typeof record !== "object") return null;
    if (typeof record.title !== "string" || !record.title) return null;
    return {
        accession: record.accession ?? null,
        title: record.title,
        taxon: record.taxon ?? null,
        entrytype: record.entrytype ?? null,
        dataset_type: record.gdstype ?? null,
        samples: record.n_samples ?? null,
        published: record.pdat ?? null,
    };
}

export const geoTools = [
    [
        "geo_datasets",
        "Search NCBI GEO for gene expression datasets by keyword, returning the GEO accession, title, organism, entry type, dataset type, sample count and publication date. Results come back in NCBI's default order (most recent first), not ranked by closeness to the term.",
        {
            term: z
                .string()
                .min(1)
                .max(200)
                .describe(
                    "Keyword to search GEO datasets for, for example breast cancer.",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe(
                    "Maximum number of datasets to return (1-10, default 5).",
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
                `${EUTILS_ROOT}/esearch.fcgi?db=gds` +
                `&term=${encodeURIComponent(query)}&retmode=json` +
                `&retmax=${n}&${IDENT}`;
            const search = await fetchJson(searchUrl);
            const result = search?.esearchresult ?? {};
            const total = Number.parseInt(result.count ?? "0", 10) || 0;
            const ids = Array.isArray(result.idlist) ? result.idlist : [];
            if (ids.length === 0) return { term: query, total, datasets: [] };
            const summaryUrl =
                `${EUTILS_ROOT}/esummary.fcgi?db=gds` +
                `&id=${ids.map(encodeURIComponent).join(",")}` +
                `&retmode=json&${IDENT}`;
            const summary = await fetchJson(summaryUrl);
            const docs = summary?.result ?? {};
            const uids = Array.isArray(docs.uids) ? docs.uids : ids;
            return {
                term: query,
                total,
                datasets: uids
                    .map((uid) => formatDataset(docs[uid]))
                    .filter(Boolean),
            };
        },
    ],
];
