import { z } from "zod";

// Spherical math on the mean Earth radius: local, deterministic, no network.
const EARTH_RADIUS_KM = 6371.0088;
const KM_PER_MILE = 1.609344;
const KM_PER_NAUTICAL_MILE = 1.852;

const COMPASS = [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
];

const latitude = z
    .number()
    .min(-90)
    .max(90)
    .describe("Latitude in decimal degrees, -90 to 90.");
const longitude = z
    .number()
    .min(-180)
    .max(180)
    .describe("Longitude in decimal degrees, -180 to 180.");

const radians = (value) => (value * Math.PI) / 180;
const degrees = (value) => (value * 180) / Math.PI;

function round(value, digits) {
    return Math.round(value * 10 ** digits) / 10 ** digits;
}

function angularDistance(from, to) {
    const deltaLat = radians(to.latitude - from.latitude);
    const deltaLon = radians(to.longitude - from.longitude);
    const a =
        Math.sin(deltaLat / 2) ** 2 +
        Math.cos(radians(from.latitude)) *
            Math.cos(radians(to.latitude)) *
            Math.sin(deltaLon / 2) ** 2;
    return 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

function initialBearing(from, to) {
    const deltaLon = radians(to.longitude - from.longitude);
    const fromLat = radians(from.latitude);
    const toLat = radians(to.latitude);
    const y = Math.sin(deltaLon) * Math.cos(toLat);
    const x =
        Math.cos(fromLat) * Math.sin(toLat) -
        Math.sin(fromLat) * Math.cos(toLat) * Math.cos(deltaLon);
    return (degrees(Math.atan2(y, x)) + 360) % 360;
}

function midpoint(from, to) {
    const fromLat = radians(from.latitude);
    const toLat = radians(to.latitude);
    const deltaLon = radians(to.longitude - from.longitude);
    const cosTo = Math.cos(toLat);
    const x = cosTo * Math.cos(deltaLon);
    const y = cosTo * Math.sin(deltaLon);
    const lat = Math.atan2(
        Math.sin(fromLat) + Math.sin(toLat),
        Math.hypot(Math.cos(fromLat) + x, y),
    );
    const lon = radians(from.longitude) + Math.atan2(y, Math.cos(fromLat) + x);
    return {
        latitude: round(degrees(lat), 5),
        longitude: round(((degrees(lon) + 540) % 360) - 180, 5),
    };
}

function compassPoint(bearing) {
    return COMPASS[Math.round(bearing / 22.5) % COMPASS.length];
}

export const geoTools = [
    [
        "distance_between",
        "Great-circle distance and initial bearing between two coordinates, with the midpoint. Local spherical math on the mean Earth radius: no network or model calls. This is the shortest path over the globe, not a road route; use a routing service for travel distance and directions.",
        {
            from_latitude: latitude.describe("Latitude of the starting point."),
            from_longitude: longitude.describe(
                "Longitude of the starting point.",
            ),
            to_latitude: latitude.describe("Latitude of the ending point."),
            to_longitude: longitude.describe("Longitude of the ending point."),
        },
        ({ from_latitude, from_longitude, to_latitude, to_longitude }) => {
            const from = {
                latitude: from_latitude,
                longitude: from_longitude,
            };
            const to = { latitude: to_latitude, longitude: to_longitude };
            const kilometers = angularDistance(from, to) * EARTH_RADIUS_KM;
            const bearing = kilometers === 0 ? 0 : initialBearing(from, to);
            return {
                kilometers: round(kilometers, 3),
                miles: round(kilometers / KM_PER_MILE, 3),
                nautical_miles: round(kilometers / KM_PER_NAUTICAL_MILE, 3),
                initial_bearing_degrees: round(bearing, 1),
                compass: compassPoint(bearing),
                midpoint: midpoint(from, to),
            };
        },
    ],
];
