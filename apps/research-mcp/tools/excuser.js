import { z } from "zod";

const EXCUSER_BASE = "https://excuser-three.vercel.app/v1/excuse";

// The nine categories the API serves, all verified live. Anything else
// answers 200 with an empty list after several seconds, so reject it here.
const CATEGORIES = [
    "family",
    "office",
    "children",
    "college",
    "party",
    "funny",
    "unbelievable",
    "developers",
    "gaming",
];

export const excuserTools = [
    [
        "excuse",
        "Get a random excuse from Excuser, optionally in one of nine categories (family, office, children, college, party, funny, unbelievable, developers, gaming). Random-only — one short excuse per call, no search. One fetch per excuse, in parallel.",
        {
            category: z.string().optional(),
            limit: z.number().int().min(1).max(10).default(1),
        },
        async ({ category, limit }, fetchJson) => {
            const normalized =
                typeof category === "string"
                    ? category.trim().toLowerCase()
                    : "";
            if (normalized && !CATEGORIES.includes(normalized))
                throw new Error(
                    `Unknown excuse category "${category}". Categories: ${CATEGORIES.join(", ")}.`,
                );
            const n =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 1;
            const url = normalized
                ? `${EXCUSER_BASE}/${normalized}`
                : EXCUSER_BASE;
            const responses = await Promise.all(
                Array.from({ length: n }, () => fetchJson(url)),
            );
            const excuses = [];
            for (const response of responses) {
                if (!Array.isArray(response) || response.length === 0)
                    throw new Error("Excuser returned no excuse");
                const record = response[0];
                if (typeof record?.excuse !== "string" || !record.excuse)
                    throw new Error("Excuser returned an excuse without text");
                excuses.push({
                    excuse: record.excuse,
                    category: record.category ?? null,
                });
            }
            return {
                category: normalized || null,
                limit: n,
                excuses,
            };
        },
    ],
];
