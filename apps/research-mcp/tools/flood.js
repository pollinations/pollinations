import { z } from "zod";

const API_ROOT = "https://environment.data.gov.uk/flood-monitoring/id/floods";
const FETCH_LIMIT = 100;
const MESSAGE_LIMIT = 500;

// EA severity levels: 1 Severe Flood Warning, 2 Flood Warning,
// 3 Flood Alert, 4 Warnings no longer in force.
const ACTIVE_MAX_LEVEL = 3;

function cleanMessage(val) {
    if (!val) return null;
    const text = String(val).replace(/\s+/g, " ").trim();
    return text ? text.slice(0, MESSAGE_LIMIT) : null;
}

function formatWarning(item) {
    const area = item.floodArea || {};
    return {
        id: item.floodAreaID ?? null,
        description: item.description ?? null,
        severity: item.severity ?? null,
        severityLevel: item.severityLevel ?? null,
        area: item.eaAreaName ?? null,
        county: area.county ?? null,
        riverOrSea: area.riverOrSea ?? null,
        isTidal: item.isTidal ?? null,
        message: cleanMessage(item.message),
        timeRaised: item.timeRaised ?? null,
        timeMessageChanged: item.timeMessageChanged ?? null,
    };
}

export const floodTools = [
    [
        "flood_warnings",
        "List live flood warnings in England from the Environment Agency flood-monitoring service (Beta). Returns warnings with description, severity, area and county, river or sea, tidal flag and the warning message. By default only warnings still in force are returned (severity level 1-3); the feed also carries expired warnings (level 4). Adjacent to fema_disaster and gdacs_event, which cover US disaster declarations and global disaster events, not live UK warnings.",
        {
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe(
                    "Maximum number of warnings to return (1-10, default 5)",
                ),
            county: z
                .string()
                .min(1)
                .max(100)
                .optional()
                .describe(
                    "Only warnings whose county field contains this text, e.g. 'Yorkshire' (case-insensitive substring match)",
                ),
            active_only: z
                .boolean()
                .default(true)
                .describe(
                    "Only warnings still in force (severity level 1-3, default true); set false to include expired warnings (level 4)",
                ),
        },
        async ({ limit, county, active_only }, fetchJson) => {
            const take =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 5;
            const activeOnly = active_only !== false;
            const countyNeedle =
                typeof county === "string" && county.trim()
                    ? county.trim().toLowerCase()
                    : null;
            const data = await fetchJson(`${API_ROOT}?_limit=${FETCH_LIMIT}`);
            const items = Array.isArray(data?.items) ? data.items : [];
            const warnings = items
                .map(formatWarning)
                .filter((w) => w.id && w.description)
                .filter((w) =>
                    activeOnly
                        ? typeof w.severityLevel === "number" &&
                          w.severityLevel <= ACTIVE_MAX_LEVEL
                        : true,
                )
                .filter((w) =>
                    countyNeedle
                        ? (w.county || "").toLowerCase().includes(countyNeedle)
                        : true,
                );
            return {
                total: warnings.length,
                warnings: warnings.slice(0, take),
            };
        },
    ],
];
