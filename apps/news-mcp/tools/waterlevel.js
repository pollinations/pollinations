// Latest observed water levels for a NOAA tide station, from the public
// api.tidesandcurrents.noaa.gov API — no key. One fetch; a full day is
// ~240 six-minute readings, so the tool returns only the latest few.
import { z } from "zod";
import { getJson } from "../fetch.js";

const DAY_MS = 86_400_000;

// NOAA CO-OPS station ids are 7 digits, for example 8518750 for New York
// (The Battery). A place name is not a station id.
const station = z
    .string()
    .regex(/^\d{7}$/, "NOAA station id is 7 digits, for example 8518750")
    .describe(
        "NOAA water-level station id, 7 digits — for example 8518750 for New York. Not a place name.",
    );

const yyyymmdd = (date) => date.toISOString().slice(0, 10).replaceAll("-", "");

const toNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
};

export const waterLevelTools = [
    [
        "water_level",
        "Latest observed water levels in feet for a NOAA tide station. Takes a 7-digit NOAA station id — for example 8518750 for New York — not a place name. Times are local station time, values are feet above mean lower low water. Returns only the latest 1-3 readings, never the whole day. US stations only.",
        z.object({
            station: station
                .default("8518750")
                .describe(
                    "NOAA water-level station id, 7 digits — for example 8518750 for New York. Not a place name.",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(3)
                .default(1)
                .describe(
                    "How many of the latest readings to return (1-3, default 1).",
                ),
        }),
        async ({ station: stationId = "8518750", limit = 1 } = {}) => {
            // Zod only validates via the MCP server, so check again here for
            // direct handler calls, with a plain message rather than a zod dump.
            const idResult = station.safeParse(stationId);
            if (!idResult.success)
                throw new Error(idResult.error.issues[0].message);
            if (!Number.isInteger(limit) || limit < 1 || limit > 3)
                throw new Error("limit must be an integer between 1 and 3.");
            // Yesterday to today, so there is always data even just after
            // midnight; the latest readings are sliced out below.
            const now = new Date();
            const query = new URLSearchParams({
                product: "water_level",
                begin_date: yyyymmdd(new Date(now.getTime() - DAY_MS)),
                end_date: yyyymmdd(now),
                datum: "MLLW",
                station: idResult.data,
                time_zone: "lst_ldt",
                units: "english",
                format: "json",
            });
            const data = await getJson(
                `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?${query}`,
            );
            if (!Array.isArray(data?.data))
                throw new Error(
                    "NOAA water levels did not return a reading list.",
                );
            return {
                station: idResult.data,
                name:
                    typeof data.metadata?.name === "string"
                        ? data.metadata.name
                        : null,
                datum: "MLLW",
                units: "feet",
                readings: data.data.slice(-limit).map((reading) => ({
                    time: typeof reading.t === "string" ? reading.t : null,
                    value_ft: toNumber(reading.v),
                    sigma_ft: toNumber(reading.s),
                })),
            };
        },
    ],
];
