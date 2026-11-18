import { z } from "zod";

const API_ROOT = "https://www.speedrun.com/api/v1/games";

function formatGame(game) {
    return {
        id: game.id ?? null,
        name: game.names?.international ?? null,
        abbreviation: game.abbreviation ?? null,
        released: game.released ?? null,
        releaseDate: game["release-date"] ?? null,
        weblink: game.weblink ?? null,
        platforms: Array.isArray(game.platforms) ? game.platforms.length : 0,
    };
}

export const speedrunTools = [
    [
        "speedrun_game",
        "Search speedrun.com for games by name and return each match's id, name, abbreviation, release year and date, page link and platform count. A name with no matches returns an empty list, not an error.",
        {
            name: z
                .string()
                .min(1)
                .max(200)
                .describe(
                    "Game name to search for (partial names work, e.g. 'celeste')",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe(
                    "Maximum number of results to return (1-10, default 5)",
                ),
        },
        async ({ name, limit }, fetchJson) => {
            const term = typeof name === "string" ? name.trim() : "";
            if (!term) throw new Error("Provide a game name to search for.");
            const count =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 5;
            const url = `${API_ROOT}?name=${encodeURIComponent(term)}&max=${count}`;
            const data = await fetchJson(url);
            if (!data || !Array.isArray(data.data))
                throw new Error(
                    "speedrun.com returned an unexpected response; try again.",
                );
            const games = data.data.slice(0, count).map(formatGame);
            return {
                query: term,
                total: data.pagination?.size ?? games.length,
                games,
            };
        },
    ],
];
