import { z } from "zod";
import { fetchJson } from "../fetch.js";
import { abstractToText } from "./europe-pmc.js";

// TVMaze's public API is keyless. Search returns scored show objects (at
// most 10), so the tool projects client-side to the requested limit; the
// detail endpoint returns one show.
const API = "https://api.tvmaze.com";

function showSummary(show) {
    return {
        id: show.id,
        name: show.name ?? null,
        type: show.type ?? null,
        language: show.language ?? null,
        genres: show.genres ?? [],
        status: show.status ?? null,
        runtime: show.runtime ?? null,
        premiered: show.premiered ?? null,
        summary: abstractToText(show.summary),
        url: show.url ?? null,
    };
}

export const tvmazeTools = [
    [
        "tvmaze_search",
        "Search TV shows on TVMaze by title. Returns the best-matching shows with type, language, genres, status, runtime, premiere date and a plain-text summary. Use tvmaze_show for full detail on one show.",
        {
            query: z
                .string()
                .trim()
                .min(1)
                .max(500)
                .describe("Show title or keywords, for example Girls."),
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe(
                    "Maximum number of shows to return. The API returns at most 10 matches.",
                ),
        },
        async ({ query, limit }) => {
            const url = new URL(`${API}/search/shows`);
            url.searchParams.set("q", query);
            const data = await fetchJson(url);
            const results = Array.isArray(data) ? data : [];
            const shows = results.slice(0, limit).map(({ score, show }) => ({
                score,
                ...showSummary(show),
            }));
            return { query, total: results.length, shows };
        },
    ],
    [
        "tvmaze_show",
        "Read one TV show on TVMaze by ID: type, language, genres, status, runtime, premiere date and a plain-text summary.",
        {
            id: z
                .number()
                .int()
                .min(1)
                .describe(
                    "TVMaze show ID, for example 139 for Girls. Find IDs with tvmaze_search.",
                ),
        },
        async ({ id }) => showSummary(await fetchJson(`${API}/shows/${id}`)),
    ],
];
