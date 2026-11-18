import { z } from "zod";

const MACROSTRAT_ROOT = "https://macrostrat.org/api/v2";

// The default /units response carries no lithology: that lives only in the
// 100 KB response=long body, which the tool never fetches. What it returns
// is the unit name, the stratigraphic formation/group, the age range in
// millions of years, the thickness range in metres and where it outcrops.
function formatUnit(record) {
    if (!record || typeof record !== "object") return null;
    if (typeof record.unit_name !== "string" || !record.unit_name) return null;
    const text = (value) => (typeof value === "string" && value ? value : null);
    const number = (value) =>
        typeof value === "number" && Number.isFinite(value) ? value : null;
    return {
        unit_name: record.unit_name,
        formation: text(record.Fm),
        group: text(record.Gp),
        top_age_ma: number(record.t_age),
        bottom_age_ma: number(record.b_age),
        max_thickness_m: number(record.max_thick),
        min_thickness_m: number(record.min_thick),
        outcrop: text(record.outcrop),
    };
}

export const macrostratTools = [
    [
        "macrostrat_units",
        "List the geological units (rock formations) at a latitude/longitude point from Macrostrat, returning each unit's name, formation, group, age range in millions of years, thickness range in metres and outcrop. Ages are in millions of years before present; the top age is the younger end. Lithology is not returned: it lives only in Macrostrat's 100 KB long response, which this tool never fetches.",
        {
            lat: z
                .number()
                .min(-90)
                .max(90)
                .describe(
                    "Latitude in decimal degrees, -90 to 90, for example 40.",
                ),
            lng: z
                .number()
                .min(-180)
                .max(180)
                .describe(
                    "Longitude in decimal degrees, -180 to 180, for example -105.",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe(
                    "Maximum number of units to return (1-10, default 5).",
                ),
        },
        async ({ lat, lng, limit }, fetchJson) => {
            // Validated here too because zod only applies via the MCP server,
            // and Macrostrat silently wraps out-of-range longitudes and
            // answers empty for out-of-range latitudes instead of erroring.
            if (
                typeof lat !== "number" ||
                !Number.isFinite(lat) ||
                lat < -90 ||
                lat > 90
            )
                throw new Error("lat must be a number between -90 and 90.");
            if (
                typeof lng !== "number" ||
                !Number.isFinite(lng) ||
                lng < -180 ||
                lng > 180
            )
                throw new Error("lng must be a number between -180 and 180.");
            const n =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 5;
            const url = `${MACROSTRAT_ROOT}/units?lat=${lat}&lng=${lng}`;
            const data = await fetchJson(url);
            const units = data?.success?.data;
            if (!Array.isArray(units))
                throw new Error("Unexpected response from Macrostrat.");
            return {
                lat,
                lng,
                total: units.length,
                units: units
                    .map((record) => formatUnit(record))
                    .filter(Boolean)
                    .slice(0, n),
            };
        },
    ],
];
