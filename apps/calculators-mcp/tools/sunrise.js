// Solar times for coordinates, from the public sunrise-sunset.org API — no key.
// Times are UTC ISO strings; the API answers in ~0.5 s with a ~500 B payload.
import * as z from "zod";
import { readResponseText } from "../../../shared/response-bytes.ts";

const USER_AGENT = "calculators-mcp/0.1 (https://pollinations.ai)";

const latitude = z
    .number()
    .min(-90)
    .max(90)
    .describe("Latitude in degrees, -90 to 90");
const longitude = z
    .number()
    .min(-180)
    .max(180)
    .describe("Longitude in degrees, -180 to 180");
const day = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(
        (value) =>
            new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value,
        "not a calendar date",
    )
    .describe("Date as YYYY-MM-DD; defaults to today");

async function sunriseSunset(lat, lng, date) {
    const query = new URLSearchParams({
        lat: String(lat),
        lng: String(lng),
        formatted: "0",
    });
    if (date !== undefined) query.set("date", date);
    const response = await fetch(
        `https://api.sunrise-sunset.org/json?${query}`,
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
                () => new Error("Sunrise-Sunset response exceeds 64 KiB."),
            ),
        );
        if (!response.ok || body.status !== "OK")
            throw new Error(
                body.status
                    ? `Sunrise-Sunset answered ${body.status}`
                    : `Sunrise-Sunset answered HTTP ${response.status}`,
            );
        return body.results;
    } finally {
        await response.body?.cancel();
    }
}

export const sunriseTools = [
    [
        "sunrise_sunset",
        "Sunrise, sunset, solar noon, day length and civil twilight for a latitude/longitude on a date (default today). Times are UTC ISO strings from sunrise-sunset.org, no key. Astronomical times only — not a weather forecast.",
        {
            lat: latitude,
            lng: longitude,
            date: day.optional(),
        },
        async ({ lat, lng, date }) => {
            const results = await sunriseSunset(lat, lng, date);
            return {
                latitude: lat,
                longitude: lng,
                date: date ?? new Date().toISOString().slice(0, 10),
                sunrise: results.sunrise,
                sunset: results.sunset,
                solar_noon: results.solar_noon,
                day_length_seconds: results.day_length,
                civil_twilight_begin: results.civil_twilight_begin,
                civil_twilight_end: results.civil_twilight_end,
            };
        },
    ],
];
