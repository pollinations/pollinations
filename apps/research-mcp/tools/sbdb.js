// NASA/JPL Small-Body Database lookup. Keyless, one fetch per call. Unknown
// designations answer HTTP 200 with a "specified object was not found"
// message instead of a 404, so the handler checks for the object block.
import { z } from "zod";
import { fetchJson } from "../fetch.js";

const API = "https://ssd-api.jpl.nasa.gov/sbdb.api";

const element = (elements, name) => {
    const found = elements?.find((entry) => entry.name === name);
    const value = found ? Number(found.value) : Number.NaN;
    return Number.isFinite(value) ? value : null;
};

export const sbdbTools = [
    [
        "asteroid_lookup",
        "Look up an asteroid or comet in NASA/JPL's Small-Body Database by number, name or provisional designation: orbit class, eccentricity, semi-major axis, minimum orbit intersection distance, observation count and first observation. For example 433, Eros or 2023 FW13.",
        {
            designation: z
                .string()
                .trim()
                .min(1)
                .max(64)
                .describe(
                    "Asteroid or comet designation: a number such as 433, a name such as Eros, or a provisional designation such as 2023 FW13.",
                ),
        },
        async ({ designation }) => {
            const clean = String(designation ?? "").trim();
            if (!clean)
                throw new Error(
                    "Provide a designation such as 433, Eros or 2023 FW13.",
                );
            const data = await fetchJson(
                `${API}?sstr=${encodeURIComponent(clean)}`,
            );
            if (!data?.object)
                throw new Error(`No small body found for ${clean}.`);
            const { object, orbit } = data;
            return {
                designation: object.des,
                full_name: object.fullname ?? null,
                orbit_class: object.orbit_class?.name ?? null,
                orbit_class_code: object.orbit_class?.code ?? null,
                near_earth_object: object.neo ?? null,
                potentially_hazardous: object.pha ?? null,
                eccentricity: element(orbit?.elements, "e"),
                semi_major_axis_au: element(orbit?.elements, "a"),
                moid_au: orbit?.moid == null ? null : Number(orbit.moid),
                condition_code:
                    orbit?.condition_code == null
                        ? null
                        : Number(orbit.condition_code),
                observations_used: orbit?.n_obs_used ?? null,
                first_observation: orbit?.first_obs ?? null,
                last_observation: orbit?.last_obs ?? null,
            };
        },
    ],
];
