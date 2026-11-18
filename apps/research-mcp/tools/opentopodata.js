import { z } from "zod";

const API_ROOT = "https://api.opentopodata.org/v1";
// Datasets verified live at build time; anything else is rejected before
// fetching (the API answers 400 "Dataset ... not in config" otherwise).
const DATASETS = new Set([
    "srtm90m",
    "srtm30m",
    "aster30m",
    "etopo1",
    "mapzen",
    "eudem25m",
]);

export const opentopodataTools = [
    [
        "elevation_lookup",
        "Return the elevation in metres for one latitude/longitude pair from OpenTopoData. Default dataset srtm90m; use etopo1 for ocean points, since SRTM returns null elevation over water. The public API allows 1,000 calls/day and 1 call/second, so a 429 means the shared limit was hit — retry later.",
        {
            latitude: z
                .number()
                .min(-90)
                .max(90)
                .describe("Latitude in decimal degrees (-90 to 90)"),
            longitude: z
                .number()
                .min(-180)
                .max(180)
                .describe("Longitude in decimal degrees (-180 to 180)"),
            dataset: z
                .string()
                .optional()
                .default("srtm90m")
                .describe(
                    "Elevation dataset: srtm90m (default), srtm30m, aster30m, etopo1, mapzen or eudem25m. etopo1 covers oceans; SRTM returns null over water.",
                ),
        },
        async ({ latitude, longitude, dataset }, fetchJson) => {
            if (
                typeof latitude !== "number" ||
                !Number.isFinite(latitude) ||
                latitude < -90 ||
                latitude > 90
            ) {
                throw new Error(
                    "latitude must be a number between -90 and 90.",
                );
            }
            if (
                typeof longitude !== "number" ||
                !Number.isFinite(longitude) ||
                longitude < -180 ||
                longitude > 180
            ) {
                throw new Error(
                    "longitude must be a number between -180 and 180.",
                );
            }
            const ds = dataset ?? "srtm90m";
            if (!DATASETS.has(ds)) {
                throw new Error(
                    "dataset must be one of srtm90m, srtm30m, aster30m, etopo1, mapzen, eudem25m.",
                );
            }
            const data = await fetchJson(
                `${API_ROOT}/${ds}?locations=${latitude},${longitude}`,
            );
            const result = data?.results?.[0];
            if (!result || typeof result !== "object") {
                throw new Error(
                    "OpenTopoData returned an unexpected response shape.",
                );
            }
            return {
                dataset: result.dataset ?? ds,
                elevation: result.elevation ?? null,
                latitude: result.location?.lat ?? latitude,
                longitude: result.location?.lng ?? longitude,
            };
        },
    ],
];
