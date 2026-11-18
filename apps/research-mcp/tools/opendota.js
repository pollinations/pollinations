// OpenDota hero lookup. Keyless, one fetch per call.
// The API has no server-side search: the tool fetches the whole hero list
// (127 heroes, ~22 KB) and filters client-side on the hero name.
import { z } from "zod";

const API = "https://api.opendota.com/api/heroes";

const projectHero = (hero) => ({
    name: hero.localized_name ?? null,
    internal_name: hero.name ?? null,
    primary_attr: hero.primary_attr ?? null,
    attack_type: hero.attack_type ?? null,
    roles: Array.isArray(hero.roles) ? hero.roles : [],
});

export const opendotaTools = [
    [
        "opendota_hero",
        "Look up Dota 2 heroes by name in OpenDota: localized name, primary attribute, attack type and roles. For example Anti-Mage (agility, Melee, Carry/Escape/Nuker).",
        {
            name: z
                .string()
                .trim()
                .min(1)
                .max(200)
                .describe("Hero-name substring, such as Anti-Mage or Pudge."),
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe("Maximum heroes to return (1-10, default 5)."),
        },
        async ({ name, limit }, fetchJson) => {
            const query = String(name ?? "").trim();
            if (!query) throw new Error("Provide a hero name.");
            const count =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 5;
            const data = await fetchJson(API);
            if (!Array.isArray(data))
                throw new Error(
                    "Unexpected OpenDota response; try again later.",
                );
            const needle = query.toLowerCase();
            const matches = data.filter((hero) =>
                [hero.localized_name, hero.name].some(
                    (field) =>
                        typeof field === "string" &&
                        field.toLowerCase().includes(needle),
                ),
            );
            return {
                query,
                total: matches.length,
                heroes: matches.slice(0, count).map(projectHero),
            };
        },
    ],
];
