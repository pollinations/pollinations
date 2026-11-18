import { z } from "zod";

const API_ROOT = "https://stapi.co/api/v1/rest/character/search";
const USER_AGENT = "Pollinations-Research/0.1 (hello@pollinations.ai)";

// STAPI searches are POST with form-encoded criteria, not GET: a GET on this
// endpoint ignores the name entirely and returns the first page of all 7,571
// characters. The contract (POST, application/x-www-form-urlencoded, `name`
// field, pageNumber/pageSize query params, CharacterBaseResponse envelope)
// is from STAPI's official OpenAPI spec, downloaded live at build time.
// POST could not be exercised from this sandbox (its egress proxy blocks
// POST to stapi.co), so the live probes below cover the GET pagination
// endpoint, which returns the same envelope the search returns.
function formatCharacter(item) {
    return {
        uid: item.uid ?? null,
        name: item.name ?? null,
        gender: item.gender ?? null,
        yearOfBirth: item.yearOfBirth ?? null,
        yearOfDeath: item.yearOfDeath ?? null,
        deceased: item.deceased ?? null,
        mirror: item.mirror ?? null,
        alternateReality: item.alternateReality ?? null,
    };
}

export const stapiTools = [
    [
        "star_trek_character",
        "Search STAPI, the Star Trek API, for characters by name (e.g. Picard, Spock, Janeway). Returns matching characters with STAPI id, gender, birth and death years, and whether they are deceased, from the mirror universe, or from an alternate reality.",
        {
            name: z
                .string()
                .min(1)
                .max(200)
                .describe("Character name to search for"),
            limit: z
                .number()
                .int()
                .min(1)
                .max(25)
                .default(5)
                .describe(
                    "Maximum number of results to return (1-25, default 5)",
                ),
        },
        async ({ name, limit }) => {
            const trimmed = name?.trim();
            if (!trimmed) throw new Error("Character name is required");
            const size =
                Number.isInteger(limit) && limit >= 1 && limit <= 25
                    ? limit
                    : 5;
            const url = `${API_ROOT}?pageNumber=0&pageSize=${size}`;
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "User-Agent": USER_AGENT,
                    Accept: "application/json",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({ name: trimmed }),
                signal: AbortSignal.timeout(10000),
            });
            if (!response.ok)
                throw new Error(
                    `stapi.co returned HTTP ${response.status}${response.status === 429 ? "; rate limited, retry later" : ""}.`,
                );
            const data = await response.json();
            const characters = data?.characters;
            if (!Array.isArray(characters))
                throw new Error("STAPI returned an unexpected response");
            return {
                name: trimmed,
                total: data?.page?.totalElements ?? characters.length,
                characters: characters.map(formatCharacter),
            };
        },
    ],
];
