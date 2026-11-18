// Swiss public transport connections via transport.opendata.ch. No key;
// the API is a community-run open-data service with no SLA.
import { z } from "zod";

const API_ROOT = "https://transport.opendata.ch/v1";

function checkpoint(point) {
    if (!point?.station) return null;
    return {
        name: point.station.name ?? null,
        departure: point.departure ?? null,
        arrival: point.arrival ?? null,
        platform: point.platform ?? null,
        delay: point.delay ?? null,
    };
}

function lineNumber(number) {
    if (typeof number !== "string") return null;
    return /^\d+$/.test(number) ? String(Number(number)) : number;
}

function toSection(section) {
    const journey = section?.journey;
    if (!journey) {
        return {
            walk: true,
            duration: section?.walk?.duration ?? null,
            from: section?.departure?.station?.name ?? null,
            to: section?.arrival?.station?.name ?? null,
            departure: section?.departure?.departure ?? null,
            arrival: section?.arrival?.arrival ?? null,
        };
    }
    const line = [journey.category, lineNumber(journey.number)]
        .filter(Boolean)
        .join(" ");
    return {
        line: line || null,
        operator: journey.operator ?? null,
        to: journey.to ?? null,
        from: section.departure?.station?.name ?? null,
        departure: section.departure?.departure ?? null,
        departurePlatform: section.departure?.platform ?? null,
        arrival: section.arrival?.arrival ?? null,
        arrivalPlatform: section.arrival?.platform ?? null,
    };
}

function toConnection(connection) {
    return {
        from: checkpoint(connection.from),
        to: checkpoint(connection.to),
        duration: connection.duration ?? null,
        transfers: connection.transfers ?? null,
        products: connection.products ?? [],
        sections: (connection.sections ?? []).map(toSection),
    };
}

export const swissTools = [
    [
        "swiss_connections",
        "Find Swiss public transport connections between two stations, with departure and arrival times, duration, transfers and the line for each leg. Switzerland only, plus cross-border stations the API knows. Times are local to the station, and delays are null when unknown. No key; the API is a community-run open-data service with no SLA.",
        {
            from: z
                .string()
                .trim()
                .min(1)
                .max(100)
                .describe("Departure station name, for example Zurich."),
            to: z
                .string()
                .trim()
                .min(1)
                .max(100)
                .describe("Arrival station name, for example Bern."),
            limit: z
                .number()
                .int()
                .min(1)
                .max(5)
                .default(1)
                .describe("How many connections to return, 1 to 5."),
        },
        async ({ from, to, limit = 1 }, fetchJson) => {
            if (!from?.trim() || !to?.trim())
                throw new Error("Both from and to station names are required.");
            if (!Number.isInteger(limit) || limit < 1 || limit > 5)
                throw new Error("limit must be between 1 and 5.");
            const url =
                `${API_ROOT}/connections?from=${encodeURIComponent(from.trim())}` +
                `&to=${encodeURIComponent(to.trim())}&limit=${limit}`;
            const data = await fetchJson(url);
            const connections = Array.isArray(data?.connections)
                ? data.connections
                : [];
            if (connections.length === 0)
                throw new Error(
                    `No connections found from "${from}" to "${to}". Check the station names.`,
                );
            return {
                from: data.from?.name ?? from,
                to: data.to?.name ?? to,
                total: connections.length,
                connections: connections.map(toConnection),
            };
        },
    ],
];
