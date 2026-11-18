import { z } from "zod";

// Digimon API: name lookup only, no key. Unknown names answer HTTP 400
// with an ErrorMsg body, which the shared fetch layer surfaces as a clean
// tool error. Name matching is case-insensitive upstream (AGUMON works).
const API_ROOT = "https://digimon-api.vercel.app/api/digimon/name";

export const digimonTools = [
    [
        "digimon",
        "Look up a Digimon by name on the Digimon API. Returns name, level and image URL (the image is never fetched). Name matching is case-insensitive upstream.",
        {
            name: z
                .string()
                .min(1)
                .max(100)
                .describe(
                    "Digimon name, e.g. 'agumon'. Matching is case-insensitive.",
                ),
        },
        async ({ name }, fetchJson) => {
            const trimmed = name.trim();
            if (!trimmed) throw new Error("Digimon name must not be blank");
            const data = await fetchJson(
                `${API_ROOT}/${encodeURIComponent(trimmed)}`,
            );
            if (!Array.isArray(data) || data.length === 0)
                throw new Error("Invalid Digimon API response");
            const [first] = data;
            if (!first || typeof first.name !== "string")
                throw new Error("Invalid Digimon API response");
            return {
                name: first.name,
                level: first.level ?? null,
                image_url: first.img ?? null,
            };
        },
    ],
];
