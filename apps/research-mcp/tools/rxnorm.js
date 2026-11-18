import { z } from "zod";

const name = z.string().trim().min(1).max(200);

export const rxnormTools = [
    [
        "rxnorm_code",
        "Look up a drug name in the NLM RxNorm terminology and return its RxCUI code. Name to id only — no ingredient, brand or dose expansion. A name with no match returns rxcui null, not an error.",
        {
            name,
        },
        async ({ name }, fetchJson) => {
            if (!name?.trim()) throw new Error("A drug name is required.");
            const data = await fetchJson(
                `https://rxnav.nlm.nih.gov/REST/rxcui.json?name=${encodeURIComponent(name.trim())}`,
            );
            const ids = data?.idGroup?.rxnormId;
            if (!Array.isArray(ids) || ids.length === 0)
                return { name: name.trim(), rxcui: null };
            return { name: name.trim(), rxcui: ids[0] };
        },
    ],
];
