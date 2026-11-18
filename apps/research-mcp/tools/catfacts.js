// Cat Facts random fact. No key; the JSON endpoint is public.
import { fetchJson } from "../fetch.js";

const API_URL = "https://catfact.ninja/fact";

export const catFactTools = [
    [
        "cat_fact",
        "Fetch a random cat fact. Returns the fact and its character length. Random-only — there is no lookup by topic or id, and every call returns a different fact.",
        {},
        async () => {
            const payload = await fetchJson(API_URL);
            if (!payload || typeof payload.fact !== "string")
                throw new Error("Cat Facts did not return a fact.");
            return {
                fact: payload.fact,
                length: payload.length ?? payload.fact.length,
            };
        },
    ],
];
