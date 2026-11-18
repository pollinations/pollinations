import { z } from "zod";
import { getJson } from "../fetch.js";

// NOAA SWPC publishes the planetary K-index as a ~28 KB file of 1-minute
// entries (about 6 hours of history). There is no "latest only" endpoint, so
// the tool fetches the whole file and returns just the latest entry plus the
// previous one, so the caller can see the trend.
export const swpcTools = [
    [
        "kp_index",
        "Get the latest planetary K-index from NOAA's Space Weather Prediction Center, a 0-9 measure of geomagnetic activity over the last 3 hours. Fetches the full ~28 KB 1-minute file and returns only the latest entry plus the previous one. Runs with public NOAA SWPC API; no credentials required.",
        z.object({}),
        async () => {
            const data = await getJson(
                "https://services.swpc.noaa.gov/json/planetary_k_index_1m.json",
            );
            if (!Array.isArray(data) || data.length === 0)
                throw new Error("SWPC returned no planetary K-index entries.");
            const project = (entry) => {
                if (
                    typeof entry !== "object" ||
                    entry === null ||
                    typeof entry.time_tag !== "string" ||
                    typeof entry.kp_index !== "number"
                )
                    throw new Error(
                        "SWPC returned a planetary K-index entry without a time or Kp value.",
                    );
                return {
                    time_tag: entry.time_tag,
                    kp_index: entry.kp_index,
                    estimated_kp:
                        typeof entry.estimated_kp === "number"
                            ? entry.estimated_kp
                            : null,
                    kp: typeof entry.kp === "string" ? entry.kp : null,
                };
            };
            const latest = project(data[data.length - 1]);
            return {
                ...latest,
                previous:
                    data.length > 1 ? project(data[data.length - 2]) : null,
            };
        },
    ],
];
