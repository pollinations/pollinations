import { z } from "zod";
import { abstractToText } from "./europe-pmc.js";

// wger's exercise-translation endpoint is the only name index, and `name`
// matches exactly and case-sensitively: "squat" answers count 0 and
// "1 leg box squat" (lowercase) answers count 0, while the exact name
// answers count 1. `search=` and `name__icontains=` are silently ignored
// upstream — both return the unfiltered first page — so the tool takes one
// exact English exercise name and there is no keyword search and no limit
// (an exact match returns at most one record). The base /exercise/ list
// carries no names at all, and /exerciseinfo/ answers ~13 KB per exercise,
// so the tool fetches the small translation record first and one
// exerciseinfo record by id for category, equipment and muscles.
const API = "https://wger.de/api/v2";

function projectExercise(translation, info) {
    const description = abstractToText(translation.description)?.trim() ?? null;
    return {
        id: translation.exercise,
        name: translation.name,
        description:
            description && description.length > 500
                ? `${description.slice(0, 500)}`
                : description,
        description_truncated: Boolean(description && description.length > 500),
        category: info.category?.name ?? null,
        equipment: (info.equipment ?? []).map((item) => item.name),
        muscles: (info.muscles ?? []).map((muscle) => muscle.name_en),
        muscles_secondary: (info.muscles_secondary ?? []).map(
            (muscle) => muscle.name_en,
        ),
    };
}

export const wgerTools = [
    [
        "wger_exercise",
        "Look up one exercise in the wger Workout Manager database by its exact English name, with instructions, category, equipment and muscles worked. The name must match exactly, including case — there is no keyword search.",
        {
            name: z.string().trim().min(1).max(200),
        },
        async ({ name }, fetchJson) => {
            if (!name?.trim()) throw new Error("Provide an exercise name.");
            const list = await fetchJson(
                `${API}/exercise-translation/?language=2&name=${encodeURIComponent(name.trim())}`,
            );
            const match = list.results?.[0];
            if (!match) return { name: name.trim(), total: 0, exercises: [] };
            const info = await fetchJson(
                `${API}/exerciseinfo/${match.exercise}/`,
            );
            return {
                name: name.trim(),
                total: 1,
                exercises: [projectExercise(match, info)],
            };
        },
    ],
];
