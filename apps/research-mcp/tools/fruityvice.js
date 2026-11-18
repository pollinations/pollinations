// Fruityvice fruit lookup. No key; the API is a free public fruit
// database. Exact name only — partial names 404, matching is
// case-insensitive upstream.
import { z } from "zod";

const API_ROOT = "https://www.fruityvice.com/api/fruit";

function toFruit(entry) {
    if (!entry || typeof entry.name !== "string")
        throw new Error("Fruityvice did not return a fruit.");
    if (!entry.nutritions || typeof entry.nutritions !== "object")
        throw new Error("Fruityvice did not return nutrition data.");
    const nutritions = entry.nutritions;
    for (const field of [
        "calories",
        "fat",
        "sugar",
        "carbohydrates",
        "protein",
    ]) {
        if (typeof nutritions[field] !== "number")
            throw new Error(
                `Fruityvice did not return ${field} for this fruit.`,
            );
    }
    return {
        name: entry.name,
        id: entry.id,
        family: entry.family,
        genus: entry.genus,
        order: entry.order,
        nutritions: {
            calories: nutritions.calories,
            fat: nutritions.fat,
            sugar: nutritions.sugar,
            carbohydrates: nutritions.carbohydrates,
            protein: nutritions.protein,
        },
    };
}

export const fruityviceTools = [
    [
        "fruit",
        "Look up a fruit on Fruityvice, a free fruit database, by its exact name. Returns the fruit's family, genus, order and nutrition per 100 g (calories, fat, sugar, carbohydrates, protein). The name must match exactly — partial names find nothing — but case does not matter. No key needed.",
        {
            name: z
                .string()
                .trim()
                .min(1)
                .max(100)
                .describe("Exact fruit name, for example apple."),
        },
        async ({ name }, fetchJson) => {
            const trimmed = (name ?? "").trim();
            if (!trimmed) throw new Error("A fruit name is required.");
            let data;
            try {
                data = await fetchJson(
                    `${API_ROOT}/${encodeURIComponent(trimmed)}`,
                );
            } catch (error) {
                // Unknown and partial names answer HTTP 404 upstream.
                if (error?.message?.includes("HTTP 404"))
                    throw new Error(`No fruit found named "${trimmed}".`);
                throw error;
            }
            return toFruit(data);
        },
    ],
];
