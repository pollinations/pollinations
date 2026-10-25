import { z } from "zod";
import { getJson, publicUrl } from "../fetch.js";

const timestamp = z.string().regex(/^\d{4,14}$/);
export const wayback = [
    [
        "wayback_snapshots",
        "List recent successful archived captures of one exact URL, newest first within optional from/to dates. Returns archive links, not the archived page body.",
        z.object({
            url: z.string().url().max(2048),
            from: timestamp.optional(),
            to: timestamp.optional(),
            limit: z.number().int().min(1).max(30).default(10),
        }),
        async ({ url, from, to, limit }) => {
            publicUrl(url);
            const params = new URLSearchParams({
                url,
                matchType: "exact",
                output: "json",
                fl: "timestamp,original,statuscode,mimetype",
                filter: "statuscode:200",
                collapse: "digest",
                limit: String(-limit),
                fastLatest: "true",
            });
            if (from) params.set("from", from);
            if (to) params.set("to", to);
            const rows = await getJson(
                `https://web.archive.org/cdx/search/cdx?${params}`,
            );
            if (!Array.isArray(rows))
                throw new Error("Wayback did not return a CDX table.");
            return rows
                .slice(1)
                .reverse()
                .map(([date, original, status, type]) => ({
                    timestamp: date,
                    url: original,
                    status,
                    type,
                    snapshot: `https://web.archive.org/web/${date}/${original}`,
                }));
        },
    ],
];
