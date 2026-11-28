import * as z from "zod";
import { readResponseText } from "../../../shared/response-bytes.ts";

// api.weather.gov covers the United States, its territories and the adjacent marine
// areas. The list endpoint answers with several hundred kilobytes for a large state,
// almost all of it description and instruction prose, so the list returns the compact
// fields and the detail tool reads the long text for one alert.
//
// NWS negotiates the format from Accept and serves Atom as soon as
// application/atom+xml appears, which is why this fetch asks for JSON alone instead
// of reusing the shared JSON-or-feed client in ../fetch.js.
const USER_AGENT =
    "Pollinations-News/0.1 (+https://pollinations.ai; hello@pollinations.ai)";
const ACTIVE = "https://api.weather.gov/alerts/active";
const ALERTS = "https://api.weather.gov/alerts";
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_LIMIT = 50;

const areaCodes = z
    .string()
    .regex(
        /^[A-Z]{2}(,[A-Z]{2})*$/,
        'Use uppercase two-letter codes such as "CA" or "CA,OR". Marine areas such as "GM" are accepted too.',
    )
    .describe(
        'Where to look: a state or territory code such as "CA", a comma-separated list such as "CA,OR", or a marine area such as "GM".',
    );

async function nws(url) {
    const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
        redirect: "follow",
    });
    try {
        if (response.status === 404) return null;
        if (!response.ok)
            throw new Error(
                `api.weather.gov answered HTTP ${response.status}${response.status === 429 ? "; rate limited, try later" : ""}.`,
            );
        return JSON.parse(
            await readResponseText(
                response,
                MAX_BYTES,
                () =>
                    new Error(
                        "Weather response exceeds 8 MiB; narrow the area.",
                    ),
            ),
        );
    } finally {
        await response.body?.cancel();
    }
}

/** The fields that fit in a list entry. Long prose stays in weather_alert. */
function compact(properties) {
    return {
        id: properties.id,
        event: properties.event,
        severity: properties.severity,
        urgency: properties.urgency,
        certainty: properties.certainty,
        status: properties.status,
        message_type: properties.messageType,
        category: properties.category,
        response: properties.response,
        sender_name: properties.senderName,
        headline: properties.headline,
        area_desc: properties.areaDesc,
        sent: properties.sent,
        onset: properties.onset,
        ends: properties.ends,
        expires: properties.expires,
    };
}

export const weatherTools = [
    [
        "weather_alerts",
        "Active weather alerts from the US National Weather Service: warnings, watches and advisories in force right now. Covers the United States, its territories and the adjacent marine areas. Filter by area and optionally by severity or urgency. Returns compact entries with id, event, severity, urgency, certainty, status, message_type, category, response, sender_name, headline, area_desc, sent, onset, ends and expires. Read the full description and safety instruction for one alert with weather_alert.",
        z.object({
            area: areaCodes,
            severity: z
                .enum(["Extreme", "Severe", "Moderate", "Minor", "Unknown"])
                .optional()
                .describe("Only alerts at this severity."),
            urgency: z
                .enum(["Immediate", "Expected", "Future", "Past", "Unknown"])
                .optional()
                .describe("Only alerts at this urgency."),
            limit: z
                .number()
                .int()
                .min(1)
                .max(MAX_LIMIT)
                .default(20)
                .describe(
                    "Most alerts to return, 20 by default. The NWS endpoint has no limit parameter, so the list is capped after it arrives.",
                ),
        }),
        async ({ area, severity, urgency, limit }) => {
            const params = new URLSearchParams({ area });
            if (severity) params.set("severity", severity);
            if (urgency) params.set("urgency", urgency);
            const collection = await nws(`${ACTIVE}?${params}`);
            const features = Array.isArray(collection?.features)
                ? collection.features
                : [];
            return features
                .slice(0, limit)
                .map(({ properties }) => compact(properties));
        },
    ],
    [
        "weather_alert",
        "Read one active weather alert by the id from weather_alerts. Returns the list fields plus description (what is happening and where) and instruction (what the sender advises people to do), which the list leaves out because they are long. Alerts expire, so an id that no longer resolves means the alert is over rather than that the id was wrong.",
        z.object({
            id: z
                .string()
                .min(8)
                .max(300)
                .describe(
                    'The alert id from weather_alerts, an URN such as "urn:oid:2.49.0.1.840.0.73f2...".',
                ),
        }),
        async ({ id }) => {
            const alert = await nws(`${ALERTS}/${encodeURIComponent(id)}`);
            if (!alert)
                throw new Error(
                    `No alert with id "${id}". It may have expired; list the area again with weather_alerts.`,
                );
            const properties = alert.properties ?? {};
            return {
                ...compact(properties),
                description: properties.description,
                instruction: properties.instruction,
            };
        },
    ],
];
