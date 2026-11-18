import { z } from "zod";

const id = z.number().int().positive();

function project(character) {
    return {
        id: character.id,
        name: character.name ?? null,
        status: character.status ?? null,
        species: character.species ?? null,
        gender: character.gender ?? null,
        origin: character.origin ?? null,
        abilities: Array.isArray(character.abilities)
            ? character.abilities.slice(0, 5)
            : [],
        alias: Array.isArray(character.alias)
            ? character.alias.slice(0, 3)
            : [],
    };
}

export const finalspaceTools = [
    [
        "finalspace_character",
        "Look up a Final Space character by its numeric id. Returns the id, name, status, species, gender, origin, abilities and a few aliases. There is no name search — the API ignores its ?name= filter and returns the whole roster — so use the numeric id (Gary Goodspeed is 1).",
        {
            id,
        },
        async ({ id }, fetchJson) => {
            if (!Number.isInteger(id) || id < 1)
                throw new Error("A positive integer character id is required.");
            const data = await fetchJson(
                `https://finalspaceapi.com/api/v0/character/${id}`,
            );
            if (!data || typeof data !== "object" || Array.isArray(data))
                throw new Error(`Final Space character not found: ${id}`);
            return project(data);
        },
    ],
];
