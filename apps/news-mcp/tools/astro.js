import { z } from "zod";
import { getJson } from "../fetch.js";

// SevenTimer's astro forecast is an astronomy forecast (cloud cover, seeing,
// transparency) for a point on Earth, not a general weather forecast. The
// survey assumed the service was http only, but the https endpoint answers
// identically (200, same payload, verified live at build time), so the tool
// uses https.
export const astroTools = [
    [
        "astro_forecast",
        "Get the SevenTimer astronomy forecast (cloud cover, seeing, transparency, temperature, precipitation type) for a latitude/longitude, for planning stargazing. Coordinates are required — there is no geocoding in this tool. Each entry's timepoint is hours ahead of the init time, not a clock time. Runs against the public SevenTimer API; no credentials required.",
        z.object({
            lat: z
                .number()
                .min(-90)
                .max(90)
                .describe("Latitude in degrees (-90 to 90)"),
            lon: z
                .number()
                .min(-180)
                .max(180)
                .describe("Longitude in degrees (-180 to 180)"),
        }),
        async ({ lat, lon }) => {
            // Zod only applies via the MCP server, so re-check here to keep
            // invalid arguments from ever reaching the network.
            if (
                !Number.isFinite(lat) ||
                lat < -90 ||
                lat > 90 ||
                !Number.isFinite(lon) ||
                lon < -180 ||
                lon > 180
            )
                throw new Error(
                    "lat must be between -90 and 90 and lon between -180 and 180.",
                );
            const endpoint = `https://www.7timer.info/bin/astro.php?lon=${lon}&lat=${lat}&ac=0&unit=metric&output=json&tzshift=0`;
            const data = await getJson(endpoint);
            const series = data.dataseries;
            if (!Array.isArray(series))
                throw new Error("SevenTimer returned no forecast series.");
            return {
                lat,
                lon,
                init: data.init ?? null,
                forecast: series.slice(0, 4).map((entry) => ({
                    timepoint: entry.timepoint,
                    cloudcover: entry.cloudcover ?? null,
                    seeing: entry.seeing ?? null,
                    transparency: entry.transparency ?? null,
                    lifted_index: entry.lifted_index ?? null,
                    temp2m: entry.temp2m ?? null,
                    prec_type: entry.prec_type ?? null,
                })),
            };
        },
    ],
];
