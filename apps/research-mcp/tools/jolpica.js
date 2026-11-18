import { z } from "zod";

// Jolpica (the Ergast F1 API successor) is keyless. One request per call:
// the round path /f1/{season}/{round}/results.json returns a single race.
// Note the lookalike path /f1/{season}/results/{round}.json does NOT do
// that — it returns every race of the season with only the winner each,
// so this tool never uses it.
const API = "https://api.jolpi.ca/ergast/f1";
const SEASON = /^(current|\d{4})$/;

function formatFinisher(result) {
    const driver = result.Driver ?? {};
    return {
        position: Number(result.position),
        driver: [driver.givenName, driver.familyName].filter(Boolean).join(" "),
        driver_code: driver.code ?? null,
        constructor: result.Constructor?.name ?? null,
        time: result.Time?.time ?? null,
        status: result.status ?? null,
        points: Number(result.points ?? 0),
    };
}

export const jolpicaTools = [
    [
        "f1_results",
        "Formula 1 race results from Jolpica (the Ergast API successor): race name, circuit, date, the winner and top 3 finishers, and the total finisher count. Give a season year and a round number; omit the season for the current season. The full 20-driver table is not returned.",
        {
            season: z
                .string()
                .trim()
                .max(7)
                .default("current")
                .describe(
                    'Season year, for example "2024", or "current" for the latest season.',
                ),
            round: z
                .number()
                .int()
                .min(1)
                .max(24)
                .describe("Round number within the season, 1 to 24."),
        },
        async ({ season = "current", round }, fetchJson) => {
            const clean = String(season ?? "current")
                .trim()
                .toLowerCase();
            if (!SEASON.test(clean))
                throw new Error(
                    'Use a season year such as "2024" or "current".',
                );
            const year = Number(clean);
            if (
                clean !== "current" &&
                (year < 1950 || year > new Date().getFullYear())
            )
                throw new Error(
                    "Formula 1 seasons run from 1950 to the current year.",
                );
            if (!Number.isInteger(round) || round < 1 || round > 24)
                throw new Error("Round must be a whole number from 1 to 24.");
            const data = await fetchJson(
                `${API}/${clean}/${round}/results.json`,
            );
            const race = data?.MRData?.RaceTable?.Races?.[0];
            if (!race)
                throw new Error(
                    `No Formula 1 race found for season ${clean} round ${round}.`,
                );
            const results = race.Results ?? [];
            return {
                season: race.season,
                round: Number(race.round),
                race_name: race.raceName,
                circuit: race.Circuit?.circuitName ?? null,
                location: race.Circuit?.Location
                    ? [
                          race.Circuit.Location.locality,
                          race.Circuit.Location.country,
                      ]
                          .filter(Boolean)
                          .join(", ")
                    : null,
                date: race.date,
                time: race.time ?? null,
                url: race.url ?? null,
                total_finishers: results.length,
                top_finishers: results.slice(0, 3).map(formatFinisher),
            };
        },
    ],
];
