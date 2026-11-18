import { z } from "zod";

const API_ROOT = "https://api.tfl.gov.uk/StopPoint/Search";

function formatStop(match) {
    return {
        id: match.id ?? null,
        name: match.name ?? null,
        modes: Array.isArray(match.modes) ? match.modes : [],
        zone: match.zone ?? null,
        lat: match.lat ?? null,
        lon: match.lon ?? null,
    };
}

export const tflTools = [
    [
        "tfl_stop",
        "Search Transport for London stops and stations by name (partial names match) and return each match with its id, modes, zone, and coordinates. London only; a name with no matches returns an empty list, not an error.",
        {
            query: z
                .string()
                .min(1)
                .max(200)
                .describe(
                    "Station or stop name to search for (e.g. 'oxford circus')",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe(
                    "Maximum number of stops to return (1-10, default 5)",
                ),
        },
        async ({ query, limit }, fetchJson) => {
            const term = String(query ?? "").trim();
            if (!term) throw new Error("Stop name must not be empty.");
            const count =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 5;
            const url = `${API_ROOT}/${encodeURIComponent(term)}`;
            const data = await fetchJson(url);
            if (!Array.isArray(data?.matches))
                throw new Error(
                    "Transport for London returned an unexpected response.",
                );
            return {
                query: term,
                total: data.total ?? data.matches.length,
                stops: data.matches.slice(0, count).map(formatStop),
            };
        },
    ],
];
