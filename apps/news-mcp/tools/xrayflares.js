import { z } from "zod";
import { getJson } from "../fetch.js";

// NOAA SWPC publishes X-ray solar flares as a ~31 KB file of the last 7 days
// (82 entries at build time). There is no "latest only" endpoint, so the tool
// fetches the whole file and returns just the latest flares, newest first.
// The class letters (A/B/C/M/X plus a number) are what an agent wants; the
// scientific fields (max_xrlong, max_ratio, current_int_xrlong) are dropped.
export const xrayFlaresTools = [
    [
        "xray_flares",
        "Get the latest X-ray solar flares from NOAA's Space Weather Prediction Center (GOES primary satellite), newest first. Fetches the full 7-day file and returns only the latest 1-3 flares with begin/max/end times and classes. A quiet week can return an empty list. Runs with public NOAA SWPC API; no credentials required.",
        z.object({
            limit: z.number().int().min(1).max(3).default(1),
        }),
        async ({ limit = 1 }) => {
            const n =
                Number.isInteger(limit) && limit >= 1 && limit <= 3 ? limit : 1;
            const data = await getJson(
                "https://services.swpc.noaa.gov/json/goes/primary/xray-flares-7-day.json",
            );
            if (!Array.isArray(data))
                throw new Error("SWPC did not return an X-ray flare list.");
            const project = (entry) => {
                if (
                    typeof entry !== "object" ||
                    entry === null ||
                    typeof entry.begin_time !== "string" ||
                    typeof entry.max_time !== "string" ||
                    typeof entry.max_class !== "string"
                )
                    throw new Error(
                        "SWPC returned an X-ray flare without begin, max time or max class.",
                    );
                return {
                    begin_time: entry.begin_time,
                    max_time: entry.max_time,
                    max_class: entry.max_class,
                    begin_class:
                        typeof entry.begin_class === "string"
                            ? entry.begin_class
                            : null,
                    end_time:
                        typeof entry.end_time === "string"
                            ? entry.end_time
                            : null,
                    satellite:
                        typeof entry.satellite === "number"
                            ? entry.satellite
                            : null,
                };
            };
            return {
                total: data.length,
                flares: data.slice(-n).reverse().map(project),
            };
        },
    ],
];
