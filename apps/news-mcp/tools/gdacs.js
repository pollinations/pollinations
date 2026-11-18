import { z } from "zod";
import { getJson } from "../fetch.js";

// GDACS event types. The upstream list endpoint ignores the eventtype query
// param (verified live: ?eventtype=EQ and ?eventtype=TC returned
// byte-identical bodies with all six types mixed), so the tool fetches the
// one current-events list and filters client-side by type.
const eventTypes = ["EQ", "TC", "FL", "VO", "DR", "WF"];
const eventTypeEnum = z.enum(eventTypes);

const MAX_TEXT = 500;

function cap(value) {
    if (typeof value !== "string") return null;
    return value.length > MAX_TEXT ? `${value.slice(0, MAX_TEXT)}...` : value;
}

export const gdacsTools = [
    [
        "gdacs_event",
        "List current global disaster events from GDACS: earthquakes, tropical cyclones, floods, volcanoes, droughts and wildfires, with alert level, description, country and dates. One fetch returns the current-events list, filtered by event type. No key needed.",
        z.object({
            eventtype: eventTypeEnum
                .default("EQ")
                .describe(
                    "Disaster type: EQ earthquake, TC tropical cyclone, FL flood, VO volcano, DR drought, WF wildfire (default: EQ)",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe(
                    "Maximum number of events to return (default: 5, max: 10)",
                ),
        }),
        async (args = {}) => {
            // zod only applies via the MCP server; direct calls need the
            // same defaults. An out-of-range limit falls back to the
            // default instead of fetching (the MCP layer rejects it).
            const eventtype = args.eventtype ?? "EQ";
            const limit =
                Number.isInteger(args.limit) &&
                args.limit >= 1 &&
                args.limit <= 10
                    ? args.limit
                    : 5;
            if (!eventTypes.includes(eventtype))
                throw new Error(
                    `Unknown event type ${eventtype}; use one of ${eventTypes.join(", ")}.`,
                );
            const data = await getJson(
                "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH",
            );
            const features = Array.isArray(data?.features) ? data.features : [];
            const matched = features.filter(
                (feature) => feature?.properties?.eventtype === eventtype,
            );
            return {
                eventtype,
                total: matched.length,
                events: matched.slice(0, limit).map((feature) => {
                    const p = feature.properties ?? {};
                    return {
                        eventid: p.eventid ?? null,
                        name: cap(p.name),
                        eventname: p.eventname ?? null,
                        alertlevel: p.alertlevel ?? null,
                        description: cap(p.description),
                        country: p.country ?? null,
                        fromdate: p.fromdate ?? null,
                        todate: p.todate ?? null,
                        report: p.url?.report ?? null,
                    };
                }),
            };
        },
    ],
];
