import { z } from "zod";
import { fetchJson } from "../fetch.js";

const API_ROOT = "https://api.vam.ac.uk/v2/objects/search";
const OBJECT_URL = "https://collections.vam.ac.uk/item/";

// The caller's Pollinations key authenticates the proxy. The V&A API is
// public, so the key is never forwarded upstream.

function asText(value) {
    return typeof value === "string" && value.length > 0 ? value : null;
}

export const vamTools = [
    [
        "vam_search",
        "Search the Victoria and Albert Museum's collections by object name, artist or subject. Returns matching objects with their V&A id, title, maker, date, object type, place of origin and collections page. The upstream record is wide (images, locations, cluster facets) — only the identifying fields are returned.",
        {
            query: z
                .string()
                .min(1)
                .max(200)
                .describe("Search term, for example monet or william morris."),
            limit: z
                .number()
                .int()
                .min(1)
                .max(5)
                .default(5)
                .describe("Maximum number of results to return."),
        },
        async ({ query, limit }) => {
            const term = query.trim();
            if (term.length === 0) {
                throw new Error("Provide a search query.");
            }
            const count = Number.isInteger(limit) ? limit : 5;
            if (count < 1 || count > 5) {
                throw new Error("limit must be between 1 and 5.");
            }

            const url = new URL(API_ROOT);
            url.search = new URLSearchParams({
                q: term,
                page_size: String(count),
            }).toString();
            const payload = await fetchJson(url);
            const records = payload?.records;
            if (!Array.isArray(records)) {
                throw new Error("V&A returned an unexpected response.");
            }

            return {
                query: term,
                total:
                    typeof payload?.info?.record_count === "number"
                        ? payload.info.record_count
                        : records.length,
                objects: records.slice(0, count).map((row) => {
                    const maker = row._primaryMaker ?? {};
                    return {
                        id: row.systemNumber ?? null,
                        title: asText(row._primaryTitle),
                        object_type: asText(row.objectType),
                        maker: asText(maker.name),
                        maker_association: asText(maker.association),
                        date_text: asText(row._primaryDate),
                        place: asText(row._primaryPlace),
                        accession_number: asText(row.accessionNumber),
                        url:
                            typeof row.systemNumber === "string"
                                ? `${OBJECT_URL}${row.systemNumber}/`
                                : null,
                    };
                }),
            };
        },
    ],
];
