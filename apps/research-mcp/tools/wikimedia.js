import { z } from "zod";

const API_ROOT = "https://commons.wikimedia.org/w/api.php";

function cleanString(val) {
    if (!val) return null;
    const text = String(val)
        .replace(/<[^>]+>/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#039;|&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/\s+/g, " ")
        // Tags sat between words and punctuation; drop the stray spaces.
        .replace(/\s+([.,;:!?%)\]])/g, "$1")
        .replace(/([([{])\s+/g, "$1")
        .trim();
    return text || null;
}

// The API appends utm tracking params to file URLs; strip them.
function cleanUrl(url) {
    return url ? url.split("?")[0] : null;
}

function formatFile(page) {
    const info = page.imageinfo?.[0] ?? {};
    const meta = info.extmetadata ?? {};
    return {
        title: page.title.replace(/^File:/, ""),
        description: cleanString(meta.ImageDescription?.value),
        url: cleanUrl(info.url),
        thumbnail: cleanUrl(info.thumburl),
        mime: info.mime ?? null,
        width: info.width ? info.width : null,
        height: info.height ? info.height : null,
        size: info.size ?? null,
        license: meta.LicenseShortName?.value ?? null,
        licenseUrl: meta.LicenseUrl?.value ?? null,
        author: cleanString(meta.Artist?.value),
        pageUrl: info.descriptionurl ?? null,
    };
}

export const wikimediaCommonsTools = [
    [
        "wikimedia_commons_search",
        "Search Wikimedia Commons for freely licensed media (images, audio, video). Returns file titles, URLs, thumbnails, license, author and dimensions. All media is freely licensed — check the license before reuse.",
        {
            query: z
                .string()
                .min(1)
                .max(500)
                .describe("Search query (keywords, e.g. 'red panda')"),
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe(
                    "Maximum number of results to return (1-10, default 5)",
                ),
        },
        async ({ query, limit }, fetchJson) => {
            const data = await fetchJson(
                `${API_ROOT}?${new URLSearchParams({
                    action: "query",
                    format: "json",
                    formatversion: "2",
                    generator: "search",
                    gsrsearch: query.trim(),
                    gsrnamespace: "6",
                    gsrlimit: String(limit),
                    prop: "imageinfo",
                    iiprop: "url|size|mime|extmetadata",
                    iiurlwidth: "320",
                })}`,
            );
            const pages = [...(data?.query?.pages ?? [])].sort(
                (a, b) => (a.index ?? 0) - (b.index ?? 0),
            );
            return {
                query: query.trim(),
                results: pages.map(formatFile),
            };
        },
    ],
];
