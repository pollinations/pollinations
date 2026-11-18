import { z } from "zod";
import { fetchJson } from "../fetch.js";

export const icd10Tools = [
    [
        "icd10_code",
        "Look up ICD-10-CM diagnosis codes by code prefix (such as E11) or diagnosis words (such as diabetes) using the U.S. National Library of Medicine Clinical Tables API. Returns matching codes with their descriptions. No key needed.",
        {
            query: z.string().trim().min(1).max(200),
            limit: z.number().int().min(1).max(10).default(5),
        },
        async ({ query, limit }) => {
            const term = String(query ?? "").trim();
            if (!term) throw new Error("query must not be blank");
            const n =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 5;
            const url = new URL(
                "https://clinicaltables.nlm.nih.gov/api/icd10cm/v3/search",
            );
            url.search = new URLSearchParams({
                sf: "code,name",
                terms: term,
                maxList: String(n),
            });
            const data = await fetchJson(url);
            if (
                !Array.isArray(data) ||
                typeof data[0] !== "number" ||
                !Array.isArray(data[3])
            )
                throw new Error("Invalid Clinical Tables ICD-10 response");
            return {
                query: term,
                total: data[0],
                codes: data[3].slice(0, n).map(([code, description]) => ({
                    code: String(code),
                    description: String(description ?? ""),
                })),
            };
        },
    ],
];
