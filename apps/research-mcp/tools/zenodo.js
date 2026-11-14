import { z } from "zod";

const API_ROOT = "https://zenodo.org/api/records";
const DESCRIPTION_LIMIT = 500;
const DETAIL_DESCRIPTION_LIMIT = 2000;
const KEYWORD_LIMIT = 5;
const FILE_LIMIT = 10;

function cleanString(val) {
    if (!val) return "";
    return String(val)
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function formatCreators(creators) {
    if (!Array.isArray(creators)) return [];
    return creators.map((c) => c.name).filter(Boolean);
}

function formatRecord(item, descriptionLimit = DESCRIPTION_LIMIT) {
    const metadata = item.metadata ?? {};
    const resourceType = metadata.resource_type ?? {};
    const doi = metadata.doi ?? item.doi ?? null;
    const description = cleanString(metadata.description);
    return {
        id: item.id ?? null,
        title: cleanString(metadata.title) || null,
        creators: formatCreators(metadata.creators),
        year: metadata.publication_date?.slice(0, 4) ?? null,
        resourceType: resourceType.title ?? resourceType.type ?? null,
        doi,
        url: item.links?.self_html ?? (doi ? `https://doi.org/${doi}` : null),
        accessRight: metadata.access_right ?? null,
        description: description
            ? description.slice(0, descriptionLimit)
            : null,
    };
}

function formatDetail(item) {
    const metadata = item.metadata ?? {};
    const files = Array.isArray(item.files) ? item.files : [];
    const stats = item.stats ?? {};
    return {
        ...formatRecord(item, DETAIL_DESCRIPTION_LIMIT),
        version: metadata.version ?? null,
        license: metadata.license?.id ?? null,
        keywords: Array.isArray(metadata.keywords)
            ? metadata.keywords.slice(0, KEYWORD_LIMIT)
            : [],
        stats: {
            downloads: stats.downloads ?? null,
            views: stats.views ?? null,
        },
        files: files
            .slice(0, FILE_LIMIT)
            .map((f) => ({ name: f.key, size: f.size ?? null })),
        fileCount: files.length,
    };
}

export const zenodoTools = [
    [
        "zenodo_search",
        "Search Zenodo, the general open research repository (datasets, software, papers, presentations) by keyword or title. Returns records with title, creators, year, resource type, DOI and a short description.",
        {
            query: z
                .string()
                .min(1)
                .max(500)
                .describe(
                    "Search query (keywords or record title; Zenodo query syntax is supported)",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(20)
                .default(10)
                .describe(
                    "Maximum number of results to return (1-20, default 10)",
                ),
        },
        async ({ query, limit }, fetchJson) => {
            const trimmed = query.trim();
            const url = `${API_ROOT}?q=${encodeURIComponent(trimmed)}&size=${limit}`;
            const data = await fetchJson(url);
            const items = data?.hits?.hits || [];
            return {
                totalResults: data?.hits?.total ?? items.length,
                query: trimmed,
                records: items.map((item) => formatRecord(item)),
            };
        },
    ],
    [
        "zenodo_record",
        "Fetch one Zenodo record by its numeric record id, with the full description, license, keywords, download/view stats and file list.",
        {
            id: z
                .number()
                .int()
                .positive()
                .describe("Zenodo record id (e.g. 14611580)"),
        },
        async ({ id }, fetchJson) => {
            const data = await fetchJson(`${API_ROOT}/${id}`);
            if (!data?.id) throw new Error(`Zenodo record ${id} not found`);
            return { record: formatDetail(data) };
        },
    ],
];
