import { z } from "zod";
import { fetchJson } from "../fetch.js";

const API_ROOT = "https://api.osf.io/v2/preprints/";
const DESCRIPTION_LIMIT = 400;
// The caller's Pollinations key authenticates the proxy. OSF is public,
// so the key is never forwarded upstream.

// OSF answers the title filter with a JSON:API envelope: data[].attributes
// holds each preprint, and the real match count lives in links.meta.total
// (the top-level meta only carries the API version). Descriptions come back
// as plain text, so they are returned as-is, capped, never parsed as HTML.
function preprintSummary(record) {
    const attributes = record.attributes ?? {};
    const description = attributes.description ?? null;
    const subjects = (attributes.subjects ?? [])
        .flat()
        .map((subject) => subject?.text)
        .filter(Boolean)
        .slice(0, 3);
    return {
        id: record.id ?? null,
        title: attributes.title ?? null,
        description:
            description && description.length > DESCRIPTION_LIMIT
                ? `${description.slice(0, DESCRIPTION_LIMIT)}...`
                : description,
        date_published: attributes.date_published ?? null,
        doi: attributes.doi ?? null,
        subjects,
    };
}

export const osfTools = [
    [
        "osf_preprint",
        "Search preprints on the Open Science Framework by title. Returns titles, descriptions, publication dates, DOIs and subjects. Title words only — there is no author filter.",
        {
            query: z
                .string()
                .min(1)
                .max(200)
                .describe(
                    "Words to match against preprint titles, for example climate.",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe("Maximum number of preprints to return."),
        },
        async ({ query, limit }) => {
            const term = String(query ?? "").trim();
            if (!term) throw new Error("A search term is required.");
            const count =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 5;
            // Bracketed param names are sent literally, exactly as probed
            // live; the value is encoded, the brackets are not.
            const data = await fetchJson(
                `${API_ROOT}?filter[title]=${encodeURIComponent(term)}&page[size]=${count}`,
            );
            const records = Array.isArray(data.data) ? data.data : [];
            return {
                query: term,
                total: data.links?.meta?.total ?? records.length,
                preprints: records.slice(0, count).map(preprintSummary),
            };
        },
    ],
];
