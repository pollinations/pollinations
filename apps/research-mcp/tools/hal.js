import { z } from "zod";

const API = "https://api.archives-ouvertes.fr/search/hal/";
const ABSTRACT_LIMIT = 2_000;
const FIELDS =
    "title_s,docid,halId_s,authFullName_s,producedDateY_i,docType_s,doiId_s,uri_s";

// A HAL identifier: hal-05228972, halshs-00123456, or a bare numeric docid.
const HAL_ID = /^(?:hal[a-z]*)-\d+$/i;
const DOC_ID = /^\d+$/;

function cleanString(val) {
    if (!val) return "";
    return String(val)
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function formatRecord(doc, withAbstract) {
    const abstract = withAbstract ? cleanString(doc.abstract_s?.[0]) : null;
    return {
        docid: doc.docid ?? null,
        halId: doc.halId_s ?? null,
        title: cleanString(doc.title_s?.[0]) || null,
        authors: Array.isArray(doc.authFullName_s) ? doc.authFullName_s : [],
        year: doc.producedDateY_i ?? null,
        docType: doc.docType_s ?? null,
        doi: doc.doiId_s ?? null,
        url: doc.uri_s ?? null,
        abstract: abstract ? abstract.slice(0, ABSTRACT_LIMIT) : null,
    };
}

async function searchHal(fetchJson, params) {
    const url = `${API}?${new URLSearchParams(params)}`;
    const data = await fetchJson(url);
    return data?.response ?? { numFound: 0, docs: [] };
}

export const halTools = [
    [
        "hal_search",
        "Search HAL (hal.science), the French open research archive, for papers, theses, books, datasets and conference papers — including French and European work the Anglo-centric sources miss. Returns title, authors, year, document type, DOI, HAL id and URL.",
        {
            query: z.string().trim().min(1).max(500),
            limit: z.number().int().min(1).max(20).default(10),
        },
        async ({ query, limit }, fetchJson) => {
            const response = await searchHal(fetchJson, {
                q: query,
                rows: String(limit),
                fl: FIELDS,
            });
            return {
                totalResults: response.numFound ?? 0,
                query,
                records: (response.docs ?? []).map((doc) =>
                    formatRecord(doc, false),
                ),
            };
        },
    ],
    [
        "hal_record",
        "Fetch one HAL record by its HAL id (hal-05228972), numeric docid (5228972) or full hal.science URL, with its abstract, authors, year, document type, DOI and URL.",
        {
            id: z.string().trim().min(1).max(200),
        },
        async ({ id }, fetchJson) => {
            let q;
            const fromUrl = id.match(
                /(?:https?:\/\/)?(?:[a-z]+\.)?hal\.science\/([a-z]+-\d+)v?\d*$/i,
            );
            if (fromUrl) {
                q = `halId_s:${fromUrl[1]}`;
            } else if (HAL_ID.test(id)) {
                q = `halId_s:${id}`;
            } else if (DOC_ID.test(id)) {
                q = `docid:${id}`;
            } else {
                throw new Error(
                    "Use a HAL id like 'hal-05228972', a numeric docid like '5228972', or a hal.science URL.",
                );
            }
            const response = await searchHal(fetchJson, {
                q,
                rows: "1",
                fl: `${FIELDS},abstract_s`,
            });
            const doc = response.docs?.[0];
            if (!doc) throw new Error(`HAL: no record found for ${id}.`);
            return { record: formatRecord(doc, true) };
        },
    ],
];
