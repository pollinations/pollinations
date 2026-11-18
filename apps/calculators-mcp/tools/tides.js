// High/low tide predictions for a NOAA station, from the public
// api.tidesandcurrents.noaa.gov API — no key. One fetch, ~200 B payload.
import * as z from "zod";
import { readResponseText } from "../../../shared/response-bytes.ts";

const USER_AGENT = "calculators-mcp/0.1 (https://pollinations.ai)";

// NOAA CO-OPS station ids are 7 digits, for example 8518750 for New York
// (The Battery). A place name is not a station id — the full station list
// is ~100 KB, so there is no name lookup here.
const station = z
    .string()
    .regex(/^\d{7}$/, "NOAA station id is 7 digits, for example 8518750")
    .describe(
        "NOAA tide station id, 7 digits — for example 8518750 for New York. Not a place name.",
    );
const day = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(
        (value) =>
            new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value,
        "not a calendar date",
    )
    .describe("Date as YYYY-MM-DD; defaults to today");

async function tidePredictions(stationId, date) {
    const query = new URLSearchParams({
        product: "predictions",
        begin_date: date.replaceAll("-", ""),
        end_date: date.replaceAll("-", ""),
        datum: "MLLW",
        station: stationId,
        time_zone: "lst_ldt",
        units: "english",
        format: "json",
        interval: "hilo",
    });
    const response = await fetch(
        `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?${query}`,
        {
            headers: {
                "User-Agent": USER_AGENT,
                Accept: "application/json",
            },
            signal: AbortSignal.timeout(10000),
            redirect: "follow",
        },
    );
    try {
        const body = JSON.parse(
            await readResponseText(
                response,
                64 * 1024,
                () => new Error("NOAA tides response exceeds 64 KiB."),
            ),
        );
        // An unknown station answers HTTP 200 with an error field, not a 4xx,
        // so check for it here instead of trusting the status.
        if (body.error?.message)
            throw new Error(`NOAA tides: ${String(body.error.message).trim()}`);
        if (!response.ok)
            throw new Error(`NOAA tides answered HTTP ${response.status}`);
        if (!Array.isArray(body.predictions))
            throw new Error("NOAA tides did not return predictions.");
        return body.predictions;
    } finally {
        await response.body?.cancel();
    }
}

export const tidesTools = [
    [
        "tides",
        "High and low tide times and heights in feet for a NOAA tide station on a date (default today). Takes a 7-digit NOAA station id — for example 8518750 for New York — not a place name. Times are local station time, heights are feet above mean lower low water. US stations only.",
        {
            station,
            date: day.optional(),
        },
        async ({ station: stationId, date }) => {
            // Zod only validates via the MCP server, so check again here for
            // direct handler calls, with a plain message rather than a zod dump.
            const idResult = station.safeParse(stationId);
            if (!idResult.success)
                throw new Error(idResult.error.issues[0].message);
            const id = idResult.data;
            const dayValue =
                date === undefined
                    ? new Date().toISOString().slice(0, 10)
                    : (() => {
                          const dayResult = day.safeParse(date);
                          if (!dayResult.success)
                              throw new Error(
                                  dayResult.error.issues[0].message,
                              );
                          return dayResult.data;
                      })();
            const predictions = await tidePredictions(id, dayValue);
            return {
                station: id,
                date: dayValue,
                datum: "MLLW",
                units: "feet",
                predictions: predictions.map((p) => ({
                    time: p.t,
                    height_ft: Number(p.v),
                    type: p.type === "H" ? "high" : "low",
                })),
            };
        },
    ],
];
