import { z } from "zod";

const API_ROOT = "https://statsapi.mlb.com/api/v1/people/search";

function formatPlayer(person) {
    return {
        id: person.id ?? null,
        fullName: person.fullName ?? null,
        primaryNumber: person.primaryNumber ?? null,
        birthDate: person.birthDate ?? null,
        currentAge: person.currentAge ?? null,
        birthCity: person.birthCity ?? null,
        birthCountry: person.birthCountry ?? null,
        height: person.height ?? null,
        weight: person.weight ?? null,
        active: person.active ?? null,
        primaryPosition: person.primaryPosition?.name ?? null,
        mlbDebutDate: person.mlbDebutDate ?? null,
    };
}

export const mlbTools = [
    [
        "mlb_player",
        "Search Major League Baseball players by name (partial names match) and return their profile: number, birth date and place, height, weight, active status, primary position, and MLB debut date. A name with no matches returns an empty list, not an error.",
        {
            name: z
                .string()
                .min(1)
                .max(200)
                .describe(
                    "Player name or partial name to search for (e.g. 'Ohtani')",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe(
                    "Maximum number of players to return (1-10, default 5)",
                ),
        },
        async ({ name, limit }, fetchJson) => {
            const query = String(name ?? "").trim();
            if (!query) throw new Error("Player name must not be empty.");
            const count =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 5;
            const url = `${API_ROOT}?names=${encodeURIComponent(query)}`;
            const data = await fetchJson(url);
            const people = Array.isArray(data?.people) ? data.people : [];
            return {
                name: query,
                total: people.length,
                players: people.slice(0, count).map(formatPlayer),
            };
        },
    ],
];
