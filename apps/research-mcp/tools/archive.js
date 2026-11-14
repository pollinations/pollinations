import { z } from "zod";

const SEARCH_ROOT = "https://archive.org/advancedsearch.php";
const METADATA_ROOT = "https://archive.org/metadata";
const DESCRIPTION_LIMIT = 8_000;

const MEDIA_TYPES = [
    "texts",
    "audio",
    "movies",
    "software",
    "image",
    "data",
    "collection",
];

function cleanString(val) {
    if (!val) return "";
    return String(val)
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function asString(val) {
    if (Array.isArray(val))
        return (
            val
                .map((v) => String(v))
                .filter(Boolean)
                .join(", ") || null
        );
    return val == null ? null : String(val);
}

function formatResult(doc) {
    return {
        identifier: doc.identifier ?? null,
        title: asString(doc.title),
        creator: asString(doc.creator),
        year: doc.year == null ? null : String(doc.year),
        mediatype: doc.mediatype ?? null,
        downloads: doc.downloads ?? null,
        url: doc.identifier
            ? `https://archive.org/details/${doc.identifier}`
            : null,
    };
}

function formatItem(metadata, filesCount, itemSize, formats) {
    const description = asString(metadata.description);
    return {
        identifier: metadata.identifier ?? null,
        title: asString(metadata.title),
        creator: asString(metadata.creator),
        date: asString(metadata.date),
        mediatype: metadata.mediatype ?? null,
        description: description
            ? cleanString(description).slice(0, DESCRIPTION_LIMIT)
            : null,
        publisher: asString(metadata.publisher),
        language: asString(metadata.language),
        license: asString(metadata.licenseurl),
        collections: Array.isArray(metadata.collection)
            ? metadata.collection.map(String).slice(0, 10)
            : metadata.collection
              ? [String(metadata.collection)]
              : [],
        filesCount: filesCount ?? null,
        itemSize: itemSize ?? null,
        formats,
        url: metadata.identifier
            ? `https://archive.org/details/${metadata.identifier}`
            : null,
    };
}

export const archiveTools = [
    [
        "archive_search",
        "Search the Internet Archive's collections (books, audio, video, software, images, data) by keyword, title, or creator; optionally restrict to one media type.",
        {
            query: z
                .string()
                .min(1)
                .max(500)
                .describe("Search query (keywords, title, or creator name)"),
            mediatype: z
                .enum(MEDIA_TYPES)
                .optional()
                .describe(
                    "Restrict results to one media type (texts, audio, movies, software, image, data, collection)",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(50)
                .default(10)
                .describe(
                    "Maximum number of results to return (1-50, default 10)",
                ),
        },
        async ({ query, mediatype, limit }, fetchJson) => {
            const q = mediatype
                ? `mediatype:(${mediatype}) AND (${query.trim()})`
                : query.trim();
            const params = new URLSearchParams({
                q,
                output: "json",
                rows: String(limit),
            });
            for (const field of [
                "identifier",
                "title",
                "creator",
                "year",
                "mediatype",
                "downloads",
            ])
                params.append("fl[]", field);
            const data = await fetchJson(`${SEARCH_ROOT}?${params}`);
            const docs = data?.response?.docs || [];
            return {
                totalResults: data?.response?.numFound ?? docs.length,
                query: query.trim(),
                results: docs.map(formatResult),
            };
        },
    ],
    [
        "archive_item",
        "Retrieve metadata for one Internet Archive item by identifier: title, creator, date, media type, description, publisher, language, license, collections, file count, size, and available file formats.",
        {
            identifier: z
                .string()
                .min(1)
                .max(200)
                .describe(
                    "Internet Archive item identifier (e.g. 'prideprejudice0000aust_a4w0')",
                ),
        },
        async ({ identifier }, fetchJson) => {
            const normalized = identifier
                .trim()
                .replace(/^https?:\/\/archive\.org\/details\//i, "")
                .replace(/\/$/, "");
            if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(normalized))
                throw new Error(
                    "Use an Internet Archive identifier like 'prideprejudice0000aust_a4w0'.",
                );
            const data = await fetchJson(
                `${METADATA_ROOT}/${encodeURIComponent(normalized)}`,
            );
            // Unknown identifiers answer HTTP 200 with an empty object.
            if (!data?.metadata?.identifier)
                throw new Error(
                    `Internet Archive item '${normalized}' not found.`,
                );
            const formats = [
                ...new Set(
                    (Array.isArray(data.files) ? data.files : [])
                        .map((f) => f?.format)
                        .filter(Boolean)
                        .map(String),
                ),
            ].slice(0, 20);
            return {
                item: formatItem(
                    data.metadata,
                    data.files_count ?? null,
                    data.item_size ?? null,
                    formats,
                ),
            };
        },
    ],
];
