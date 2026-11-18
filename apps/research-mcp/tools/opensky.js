import { z } from "zod";
import { fetchJson } from "../fetch.js";

// OpenSky Network live state vectors. The API answers positional arrays:
// [icao24, callsign, origin_country, time_position, last_contact,
//  longitude, latitude, baro_altitude, on_ground, velocity, true_track,
//  vertical_rate, sensors, geo_altitude, squawk, spi, position_source].
// A bounding box is load-bearing: unfiltered /states/all is megabytes of
// live traffic, so this tool never fetches without one. The default box is
// the London area used in the live probe. `states: null` is the empty
// answer (no aircraft in the box), not an error.

const DEFAULT_BBOX = { lamin: 51.0, lomin: -0.5, lamax: 51.8, lomax: 0.5 };
const MAX_SPAN_DEGREES = 10;

function validateBbox({ lamin, lomin, lamax, lomax }) {
    const box = {
        lamin: lamin ?? DEFAULT_BBOX.lamin,
        lomin: lomin ?? DEFAULT_BBOX.lomin,
        lamax: lamax ?? DEFAULT_BBOX.lamax,
        lomax: lomax ?? DEFAULT_BBOX.lomax,
    };
    for (const [name, value] of Object.entries(box)) {
        if (!Number.isFinite(value))
            throw new Error(`Bounding box ${name} must be a number`);
    }
    if (box.lamin < -90 || box.lamin > 90 || box.lamax < -90 || box.lamax > 90)
        throw new Error("Latitude must be between -90 and 90");
    if (
        box.lomin < -180 ||
        box.lomin > 180 ||
        box.lomax < -180 ||
        box.lomax > 180
    )
        throw new Error("Longitude must be between -180 and 180");
    if (box.lamin >= box.lamax || box.lomin >= box.lomax)
        throw new Error(
            "Bounding box minimum must be smaller than its maximum",
        );
    if (
        box.lamax - box.lamin > MAX_SPAN_DEGREES ||
        box.lomax - box.lomin > MAX_SPAN_DEGREES
    )
        throw new Error(
            `Bounding box is too large; keep each side under ${MAX_SPAN_DEGREES} degrees so the live-traffic response stays small`,
        );
    return box;
}

function projectVector(vector) {
    const [
        icao24,
        callsign,
        originCountry,
        ,
        ,
        longitude,
        latitude,
        baroAltitude,
        ,
        velocity,
        heading,
    ] = vector;
    return {
        icao24,
        callsign: typeof callsign === "string" ? callsign.trim() || null : null,
        origin_country: originCountry,
        latitude,
        longitude,
        altitude: baroAltitude ?? null,
        velocity: velocity ?? null,
        heading: heading ?? null,
    };
}

export const openskyTools = [
    [
        "opensky_flights",
        "List aircraft live in the air right now inside a small bounding box, from the OpenSky Network. Returns icao24, callsign, origin country, latitude, longitude, altitude, velocity and heading per aircraft. Default box is the London area; keep the box small (at most 10 degrees per side). No flight-number or route search — this answers what is flying here right now, not where flight X is.",
        {
            lamin: z.number().min(-90).max(90).optional(),
            lomin: z.number().min(-180).max(180).optional(),
            lamax: z.number().min(-90).max(90).optional(),
            lomax: z.number().min(-180).max(180).optional(),
            limit: z.number().int().min(1).max(10).default(5),
        },
        async ({ lamin, lomin, lamax, lomax, limit }) => {
            const box = validateBbox({ lamin, lomin, lamax, lomax });
            const count =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 5;
            const url = new URL("https://opensky-network.org/api/states/all");
            url.search = new URLSearchParams({
                lamin: String(box.lamin),
                lomin: String(box.lomin),
                lamax: String(box.lamax),
                lomax: String(box.lomax),
            });
            const data = await fetchJson(url);
            if (
                data === null ||
                typeof data !== "object" ||
                Array.isArray(data)
            )
                throw new Error("Invalid OpenSky response");
            const states = data.states ?? [];
            if (!Array.isArray(states))
                throw new Error("Invalid OpenSky response");
            return {
                bbox: box,
                total: Math.min(states.length, count),
                flights: states.slice(0, count).map(projectVector),
            };
        },
    ],
];
