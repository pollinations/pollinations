import { z } from "zod";
import { getJson } from "../fetch.js";

// CelesTrak publishes the two-line element set for one satellite as a
// ~426 B JSON array with exactly one record. The catalog number is the
// NORAD id — 25544 is the ISS. The host's latency swings a lot (0.76 s to
// 17.91 s across recent probes), so a slow call can still hit the shared
// 10 s fetch timeout; that is an upstream timeout, not a missing satellite.
export const celestrakTools = [
    [
        "celestrak_satellite",
        "Get the latest orbital elements for one satellite from CelesTrak by its NORAD catalog number (25544 is the ISS). Returns the object name and id, epoch, mean motion, eccentricity, inclination, right ascension of the ascending node, argument of perigee, mean anomaly and revolution number. Runs with public CelesTrak API; no credentials required.",
        z.object({
            catnr: z
                .number()
                .int()
                .min(1)
                .describe(
                    "NORAD catalog number, e.g. 25544 for the ISS (ZARYA)",
                ),
        }),
        async ({ catnr }) => {
            if (!Number.isInteger(catnr) || catnr < 1)
                throw new Error("catnr must be a positive integer.");
            const data = await getJson(
                `https://celestrak.org/NORAD/elements/gp.php?CATNR=${catnr}&FORMAT=json`,
            );
            if (!Array.isArray(data) || data.length === 0)
                throw new Error(
                    `No CelesTrak record for catalog number ${catnr}.`,
                );
            const record = data[0];
            if (
                typeof record !== "object" ||
                record === null ||
                typeof record.OBJECT_NAME !== "string" ||
                typeof record.NORAD_CAT_ID !== "number" ||
                typeof record.EPOCH !== "string"
            )
                throw new Error(
                    "CelesTrak returned a record without a name, catalog id or epoch.",
                );
            const numberOrNull = (value) =>
                typeof value === "number" ? value : null;
            return {
                object_name: record.OBJECT_NAME,
                object_id:
                    typeof record.OBJECT_ID === "string"
                        ? record.OBJECT_ID
                        : null,
                norad_cat_id: record.NORAD_CAT_ID,
                epoch: record.EPOCH,
                mean_motion: numberOrNull(record.MEAN_MOTION),
                eccentricity: numberOrNull(record.ECCENTRICITY),
                inclination: numberOrNull(record.INCLINATION),
                ra_of_asc_node: numberOrNull(record.RA_OF_ASC_NODE),
                arg_of_pericenter: numberOrNull(record.ARG_OF_PERICENTER),
                mean_anomaly: numberOrNull(record.MEAN_ANOMALY),
                rev_at_epoch: numberOrNull(record.REV_AT_EPOCH),
            };
        },
    ],
];
