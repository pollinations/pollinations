import { z } from "zod";

const EUTILS_ROOT = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
// NCBI asks callers to identify themselves; the contact is Pollinations'
// public support address, already the contact in crossref.js and fetch.js.
const IDENT = "tool=pollinations-research&email=hello@pollinations.ai";
const SEARCH_RETMAX = 10;
const MAF_LIMIT = 5;
const HGVS_LIMIT = 500;

function formatVariant(record) {
    if (!record || typeof record !== "object" || record.error) return null;
    const snpId = record.snp_id;
    if (snpId === undefined || snpId === null) return null;
    const genes = Array.isArray(record.genes)
        ? record.genes
              .map((gene) => ({
                  name: gene?.name ?? null,
                  gene_id: gene?.gene_id ?? null,
              }))
              .filter((gene) => gene.name !== null)
        : [];
    const mafs = Array.isArray(record.global_mafs) ? record.global_mafs : [];
    const docsum = typeof record.docsum === "string" ? record.docsum : "";
    return {
        rsid: `rs${snpId}`,
        uid: record.uid ?? null,
        chromosome: record.chr ?? null,
        position: record.chrpos ?? null,
        spdi: record.spdi ?? null,
        snp_class: record.snp_class ?? null,
        functional_class: record.fxn_class || null,
        clinical_significance: record.clinical_significance || null,
        genes,
        validated: record.validated || null,
        hgvs: docsum ? docsum.slice(0, HGVS_LIMIT) : null,
        hgvs_truncated: docsum.length > HGVS_LIMIT,
        maf_study_count: mafs.length,
        global_mafs: mafs.slice(0, MAF_LIMIT).map((maf) => ({
            study: maf?.study ?? null,
            freq: maf?.freq ?? null,
        })),
    };
}

// One rs id can match several merged dbSNP records for the same variant
// (rs699 answers six uids, all snp_id 699). Keep one entry per distinct
// variant, preferring the canonical record (merged_sort "0") when present.
function dedupe(records) {
    const bySnp = new Map();
    for (const record of records) {
        const variant = formatVariant(record);
        if (!variant) continue;
        const seen = bySnp.get(variant.rsid);
        if (!seen || (record.merged_sort === "0" && !seen.canonical)) {
            bySnp.set(variant.rsid, {
                variant,
                canonical: record.merged_sort === "0",
            });
        }
    }
    return [...bySnp.values()].map((entry) => entry.variant);
}

export const dbsnpTools = [
    [
        "dbsnp_variant",
        "Look up a dbSNP variant by rs id, returning chromosome, position, SPDI, functional class, clinical significance, genes, HGVS notation and global allele frequencies. One rs id can match several merged dbSNP records; the tool returns one entry per distinct variant. ClinVar answers variant-disease associations and NCBI Gene answers gene records; this answers the variant itself.",
        {
            rsid: z
                .string()
                .min(1)
                .max(20)
                .describe("dbSNP rs id, for example rs699."),
        },
        async ({ rsid }, fetchJson) => {
            const query = rsid.trim();
            if (!/^rs\d+$/i.test(query)) {
                throw new Error("Use a dbSNP rs id like rs699.");
            }
            const id = query.toLowerCase();
            const searchUrl =
                `${EUTILS_ROOT}/esearch.fcgi?db=snp` +
                `&term=${encodeURIComponent(id)}&retmode=json` +
                `&retmax=${SEARCH_RETMAX}&${IDENT}`;
            const search = await fetchJson(searchUrl);
            const result = search?.esearchresult ?? {};
            const ids = Array.isArray(result.idlist) ? result.idlist : [];
            if (ids.length === 0) return { rsid: id, total: 0, variants: [] };
            const summaryUrl =
                `${EUTILS_ROOT}/esummary.fcgi?db=snp` +
                `&id=${ids.map(encodeURIComponent).join(",")}` +
                `&retmode=json&${IDENT}`;
            const summary = await fetchJson(summaryUrl);
            const docs = summary?.result ?? {};
            const uids = Array.isArray(docs.uids) ? docs.uids : ids;
            const variants = dedupe(uids.map((uid) => docs[uid]));
            return { rsid: id, total: variants.length, variants };
        },
    ],
];
