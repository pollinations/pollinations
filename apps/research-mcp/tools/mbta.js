import { z } from "zod";

const API_ROOT = "https://api-v3.mbta.com/vehicles";

// Keyless, 20 requests/minute (official MBTA docs; a free key raises it to
// 1,000/min). The shared fetchJson already turns a 429 into
// "api-v3.mbta.com returned HTTP 429; rate limited, retry later", so the
// tool surfaces the throttle as a clean error instead of raw output.
function formatVehicle(item, fallbackRoute) {
    const attributes = item.attributes ?? {};
    const route = item.relationships?.route?.data?.id ?? fallbackRoute;
    return {
        vehicle_id: item.id ?? null,
        label: attributes.label ?? null,
        route: route ?? null,
        current_status: attributes.current_status ?? null,
        direction_id: attributes.direction_id ?? null,
        bearing: attributes.bearing ?? null,
        latitude: attributes.latitude ?? null,
        longitude: attributes.longitude ?? null,
        speed: attributes.speed ?? null,
        occupancy_status: attributes.occupancy_status ?? null,
        carriages: Array.isArray(attributes.carriages)
            ? attributes.carriages.map((carriage) => ({
                  label: carriage.label ?? null,
                  occupancy_status: carriage.occupancy_status ?? null,
                  occupancy_percentage: carriage.occupancy_percentage ?? null,
              }))
            : [],
    };
}

export const mbtaTools = [
    [
        "mbta_vehicles",
        "Live MBTA vehicle positions for one Boston transit route (e.g. 'Red'). Returns each vehicle's label, status, location, speed and carriage occupancy. Boston only. Keyless, 20 requests/minute — a rate-limited call fails cleanly with 'rate limited, retry later'.",
        {
            route: z
                .string()
                .min(1)
                .max(100)
                .describe(
                    "MBTA route id, e.g. 'Red' (required — unfiltered is the whole Boston system)",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe(
                    "Maximum number of vehicles to return (1-10, default 5)",
                ),
        },
        async ({ route, limit }, fetchJson) => {
            const id = String(route ?? "").trim();
            if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id)) {
                throw new Error(
                    "route must be an MBTA route id, e.g. 'Red' or 'Green-B'.",
                );
            }
            const count =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 5;
            const url = `${API_ROOT}?filter[route]=${encodeURIComponent(id)}&page[limit]=${count}`;
            const data = await fetchJson(url);
            const items = data?.data;
            if (!Array.isArray(items)) {
                throw new Error("MBTA returned an unexpected response shape.");
            }
            return {
                route: id,
                total: items.length,
                vehicles: items.map((item) => formatVehicle(item, id)),
            };
        },
    ],
];
