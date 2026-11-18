import { z } from "zod";

const API_ROOT = "https://last-airbender-api.fly.dev/api/v1/characters";

function formatCharacter(item) {
    const allies = Array.isArray(item.allies) ? item.allies : [];
    const enemies = Array.isArray(item.enemies) ? item.enemies : [];
    const affiliation = item.affiliation
        ? String(item.affiliation).trim()
        : null;
    return {
        id: item._id ?? null,
        name: item.name ?? null,
        affiliation: affiliation || null,
        allies: allies.slice(0, 3).map(String),
        alliesCount: allies.length,
        enemies: enemies.slice(0, 3).map(String),
        enemiesCount: enemies.length,
        photo_url: item.photoUrl ?? null,
    };
}

export const airbenderTools = [
    [
        "airbender_character",
        "Search Avatar: The Last Airbender characters by name. Returns affiliation, allies and enemies, and a photo URL (returned, never fetched). Name matching is a case-insensitive substring search; total is the number of characters returned, up to the limit, because the API returns a bare list with no total count.",
        {
            name: z
                .string()
                .min(1)
                .max(200)
                .describe("Character name to search for (substring match)"),
            limit: z
                .number()
                .int()
                .min(1)
                .max(25)
                .default(5)
                .describe(
                    "Maximum number of characters to return (1-25, default 5)",
                ),
        },
        async ({ name, limit }, fetchJson) => {
            const query = (name ?? "").trim();
            if (!query)
                throw new Error("Provide a character name to search for.");
            const take = limit ?? 5;
            if (!Number.isInteger(take) || take < 1 || take > 25)
                throw new Error("limit must be between 1 and 25");
            // The API honours perPage (verified: 2, 5 and 100 all return
            // exactly that many), but a limit param empties the result
            // (name=a&limit=2 answers []), so perPage is sent instead and
            // limit is never sent.
            const data = await fetchJson(
                `${API_ROOT}?name=${encodeURIComponent(query)}&perPage=${take}`,
            );
            if (!Array.isArray(data))
                throw new Error("Unexpected Last Airbender API response.");
            return {
                name: query,
                total: data.length,
                characters: data.map(formatCharacter),
            };
        },
    ],
];
