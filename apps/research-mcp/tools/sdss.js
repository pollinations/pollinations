import { z } from "zod";
import { fetchText } from "../fetch.js";

const API_ROOT =
    "https://skyserver.sdss.org/dr18/SkyServerWS/SearchTools/SqlSearch";
const HALF_BOX_DEG = 1;

// SDSS object IDs are 64-bit integers, above JavaScript's safe-integer range:
// JSON.parse("1237651758284999323") silently becomes 1237651758284999400.
// So the tool reads the raw response text and lifts the objid digits out with
// a regex before parsing the rest (ra/dec are small floats, safe to parse).
const OBJID_PATTERN = /"objid":\s*(\d+)/g;

function formatNumber(value, name) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`${name} must be a finite number.`);
    }
    return String(value);
}

export const sdssTools = [
    [
        "sdss_objects",
        "List Sloan Digital Sky Survey objects near a sky position (right ascension and declination, degrees). Returns each object's SDSS objid plus ra and dec. The objid is a 64-bit identifier, so it is returned as a string to keep every digit exact.",
        {
            ra: z
                .number()
                .min(0)
                .max(360)
                .describe(
                    "Right ascension in degrees, 0 to 360 (for example 270 for the galactic centre region).",
                ),
            dec: z
                .number()
                .min(-90)
                .max(90)
                .describe("Declination in degrees, -90 to 90."),
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe("Maximum objects to return. Defaults to 5."),
        },
        async ({ ra, dec, limit }) => {
            const raValue = formatNumber(ra, "ra");
            const decValue = formatNumber(dec, "dec");
            if (Number(raValue) < 0 || Number(raValue) > 360) {
                throw new Error("ra must be between 0 and 360.");
            }
            if (Number(decValue) < -90 || Number(decValue) > 90) {
                throw new Error("dec must be between -90 and 90.");
            }
            const count =
                limit === undefined
                    ? 5
                    : Number.isInteger(limit) && limit >= 1 && limit <= 10
                      ? limit
                      : 5;
            // Fixed bounded query: a 2-degree box around the position, TOP N.
            // Only validated numbers are interpolated, never caller text, so
            // no raw SQL ever reaches the server.
            const raLo = Number(raValue) - HALF_BOX_DEG;
            const raHi = Number(raValue) + HALF_BOX_DEG;
            const decLo = Math.max(-90, Number(decValue) - HALF_BOX_DEG);
            const decHi = Math.min(90, Number(decValue) + HALF_BOX_DEG);
            const sql =
                `SELECT TOP ${count} objid,ra,dec FROM PhotoObj ` +
                `WHERE ra BETWEEN ${raLo} AND ${raHi} ` +
                `AND dec BETWEEN ${decLo} AND ${decHi}`;
            const url = new URL(API_ROOT);
            url.search = new URLSearchParams({
                cmd: sql,
                format: "json",
            }).toString();

            const text = await fetchText(url);
            const objids = [...text.matchAll(OBJID_PATTERN)].map(
                (match) => match[1],
            );
            const payload = JSON.parse(text);
            const table = Array.isArray(payload)
                ? payload.find((entry) => entry?.TableName === "Table1")
                : undefined;
            const rows = table?.Rows;
            if (!Array.isArray(rows)) {
                throw new Error("SDSS returned an unexpected response.");
            }
            if (objids.length !== rows.length) {
                throw new Error("SDSS returned an unexpected response.");
            }
            return {
                ra: Number(raValue),
                dec: Number(decValue),
                limit: count,
                total: rows.length,
                objects: rows.map((row, index) => {
                    if (
                        typeof row.ra !== "number" ||
                        typeof row.dec !== "number"
                    ) {
                        throw new Error(
                            "SDSS returned an unexpected response.",
                        );
                    }
                    return {
                        objid: objids[index],
                        ra: row.ra,
                        dec: row.dec,
                    };
                }),
            };
        },
    ],
];
