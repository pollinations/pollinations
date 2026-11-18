import { fetchJson } from "../fetch.js";

// ZenQuotes free endpoints, verified live 2026-11-19: /api/random and
// /api/today work without a key, but /api/authors and /api/quotes/author/*
// answer 200 with "Unauthorized API request, key required", so only the
// random endpoint is used. The server also drops requests carrying curl's
// default User-Agent with an empty reply, but answers the shared fetch
// layer's User-Agent and node fetch fine.
export const zenquotesTools = [
    [
        "quote",
        "Get a random inspirational quote from ZenQuotes (no key). Random only — there is no search and no way to ask for a specific quote or author. Quotes are returned as published. Novelty tool.",
        {},
        async () => {
            const data = await fetchJson("https://zenquotes.io/api/random");
            const entry = Array.isArray(data) ? data[0] : null;
            if (
                !entry ||
                typeof entry.q !== "string" ||
                entry.q.length === 0 ||
                typeof entry.a !== "string" ||
                entry.a.length === 0
            )
                throw new Error("Invalid ZenQuotes response");
            if (
                entry.a === "zenquotes.io" ||
                entry.q.startsWith("Unauthorized")
            )
                throw new Error(
                    "ZenQuotes refused the request; the free random endpoint may have changed.",
                );
            return { quote: entry.q, author: entry.a };
        },
    ],
];
