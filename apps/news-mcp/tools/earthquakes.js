// Adapted from tomdacatto's #17754; grouped under the shared private Worker.
import * as z from "zod";
import { readResponseText } from "../../../shared/response-bytes.ts";

const USER_AGENT = "earthquakes-mcp/0.1 (https://pollinations.ai)";
const USGS_QUERY = "https://earthquake.usgs.gov/fdsnws/event/1/query";
const DAY_MS = 86_400_000;
const MAX_RANGE_DAYS = 366;

/** Epoch ms of 00:00 UTC on a YYYY-MM-DD day, or NaN when that day does not exist (2026-02-30). */
function dayMs(day) {
    const ms = Date.parse(`${day}T00:00:00Z`);
    return Number.isFinite(ms) && new Date(ms).toISOString().startsWith(day)
        ? ms
        : NaN;
}

const dayText = (ms) => new Date(ms).toISOString().slice(0, 10);

const isoDay = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.")
    .refine((day) => !Number.isNaN(dayMs(day)), "Not a real calendar date.")
    .describe("UTC calendar day, YYYY-MM-DD");

/**
 * USGS window for a search. end_date is inclusive, but USGS treats endtime as
 * exclusive, so the endtime sent is the day after. Without end_date there is no
 * endtime, and USGS searches up to now. The start defaults to 7 days before the end.
 */
function searchWindow({ start_date, end_date }, now) {
    const end = end_date ?? dayText(now.getTime());
    const start = start_date ?? dayText(dayMs(end) - 7 * DAY_MS);
    const days = (dayMs(end) - dayMs(start)) / DAY_MS;
    if (days < 0) {
        throw new Error(
            "start_date must be on or before end_date (end_date defaults to today).",
        );
    }
    if (days > MAX_RANGE_DAYS) {
        throw new Error(
            `The date range can be at most ${MAX_RANGE_DAYS} days.`,
        );
    }
    return {
        starttime: start,
        endtime:
            end_date === undefined
                ? undefined
                : dayText(dayMs(end_date) + DAY_MS),
    };
}

async function usgs(params) {
    const response = await fetch(
        `${USGS_QUERY}?${new URLSearchParams({ format: "geojson", ...params })}`,
        {
            headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
            signal: AbortSignal.timeout(10000),
            redirect: "follow",
        },
    );
    try {
        if (response.status === 404) return null;
        if (!response.ok)
            throw new Error(`USGS answered HTTP ${response.status}`);
        return JSON.parse(
            await readResponseText(
                response,
                8 * 1024 * 1024,
                () =>
                    new Error("USGS response exceeds 8 MiB; narrow the query."),
            ),
        );
    } finally {
        await response.body?.cancel();
    }
}

const failure = (message) => {
    throw new Error(message);
};

/** A GeoJSON feature as a flat event. GeoJSON coordinates are [longitude, latitude, depth_km]. */
function toEvent(feature) {
    const { id, geometry, properties: p } = feature;
    const [longitude, latitude, depth_km] = geometry.coordinates;
    return {
        id,
        time: new Date(p.time).toISOString(),
        magnitude: p.mag,
        magnitude_type: p.magType,
        place: p.place,
        depth_km,
        latitude,
        longitude,
        tsunami: p.tsunami === 1,
        felt: p.felt,
        url: p.url,
    };
}

export const earthquakeTools = [
    [
        "earthquake_search",
        "Search USGS earthquakes, newest first by default. Defaults: magnitude 4.5 and up, the last 7 days up to today (UTC). end_date is inclusive and the range is at most 366 days. An optional near point with radius_km limits results by distance. Returns id, time (ISO UTC), magnitude, magnitude_type, place, depth_km, latitude, longitude, tsunami, felt and url. Read one event with earthquake_event.",
        z.object({
            min_magnitude: z.number().min(-2).max(10).default(4.5),
            start_date: isoDay.optional(),
            end_date: isoDay.optional(),
            near: z
                .object({
                    latitude: z.number().min(-90).max(90),
                    longitude: z.number().min(-180).max(180),
                    radius_km: z.number().min(1).max(2000).default(300),
                })
                .optional(),
            limit: z.number().int().min(1).max(50).default(10),
            order: z.enum(["time", "magnitude"]).default("time"),
        }),
        async ({ min_magnitude, start_date, end_date, near, limit, order }) => {
            const range = searchWindow({ start_date, end_date }, new Date());
            const collection = await usgs({
                minmagnitude: min_magnitude,
                starttime: range.starttime,
                ...(range.endtime && { endtime: range.endtime }),
                ...(near && {
                    latitude: near.latitude,
                    longitude: near.longitude,
                    maxradiuskm: near.radius_km,
                }),
                orderby: order,
                limit,
            });
            return collection.features.map(toEvent);
        },
    ],
    [
        "earthquake_event",
        "Read one USGS earthquake by the id from earthquake_search. Returns the same fields plus status (automatic or reviewed), alert (green to red, or null) and significance.",
        z.object({
            id: z
                .string()
                .regex(
                    /^[a-z]{2}[a-z0-9]{6,12}$/,
                    "Use a USGS event id such as us6000tytg.",
                ),
        }),
        async ({ id }) => {
            const feature = await usgs({ eventid: id });
            if (!feature) {
                return failure(`No earthquake with id "${id}".`);
            }
            return {
                ...toEvent(feature),
                status: feature.properties.status,
                alert: feature.properties.alert,
                significance: feature.properties.sig,
            };
        },
    ],
];
