import { z } from "zod";
import { getJson } from "../fetch.js";

// NASA EONET (Earth Observatory Natural Event Tracker) lists open natural
// events — wildfires, severe storms, volcanoes, earthquakes and more. Each
// event carries a full geometry track (a storm can have a dozen points), so
// the tool returns only the latest point per event, keeping the output small.
export const eonetTools = [
    [
        "nasa_events",
        "List natural events from NASA EONET — wildfires, severe storms, volcanoes, earthquakes and more. Returns each event's id, title, categories and its latest location point only; the full geometry track is dropped. Keyless, one fetch per call.",
        z.object({
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe("How many events to return (1-10, default 5)."),
            status: z
                .enum(["open", "closed"])
                .default("open")
                .describe("Whether to list open or closed events."),
        }),
        async ({ limit = 5, status = "open" } = {}) => {
            if (!Number.isInteger(limit) || limit < 1 || limit > 10)
                throw new Error("limit must be an integer between 1 and 10.");
            if (status !== "open" && status !== "closed")
                throw new Error('status must be "open" or "closed".');
            const params = new URLSearchParams({
                limit: String(limit),
                status,
            });
            const data = await getJson(
                `https://eonet.gsfc.nasa.gov/api/v3/events?${params}`,
            );
            if (!Array.isArray(data?.events))
                throw new Error("EONET did not return an event list.");
            const project = (event) => {
                if (
                    typeof event !== "object" ||
                    event === null ||
                    typeof event.id !== "string" ||
                    typeof event.title !== "string"
                )
                    throw new Error(
                        "EONET returned an event without an id or title.",
                    );
                const geometry = Array.isArray(event.geometry)
                    ? event.geometry
                    : [];
                const last = geometry[geometry.length - 1];
                const point =
                    last &&
                    typeof last === "object" &&
                    last.type === "Point" &&
                    Array.isArray(last.coordinates) &&
                    last.coordinates.length === 2 &&
                    typeof last.coordinates[0] === "number" &&
                    typeof last.coordinates[1] === "number"
                        ? {
                              date:
                                  typeof last.date === "string"
                                      ? last.date
                                      : null,
                              type: "Point",
                              longitude: last.coordinates[0],
                              latitude: last.coordinates[1],
                              magnitude:
                                  typeof last.magnitudeValue === "number"
                                      ? last.magnitudeValue
                                      : null,
                              magnitude_unit:
                                  typeof last.magnitudeUnit === "string"
                                      ? last.magnitudeUnit
                                      : null,
                          }
                        : last && typeof last === "object"
                          ? {
                                date:
                                    typeof last.date === "string"
                                        ? last.date
                                        : null,
                                type:
                                    typeof last.type === "string"
                                        ? last.type
                                        : null,
                                longitude: null,
                                latitude: null,
                                magnitude: null,
                                magnitude_unit: null,
                            }
                          : null;
                return {
                    id: event.id,
                    title: event.title,
                    categories: Array.isArray(event.categories)
                        ? event.categories
                              .map((category) =>
                                  typeof category?.title === "string"
                                      ? category.title
                                      : null,
                              )
                              .filter(Boolean)
                        : [],
                    description:
                        typeof event.description === "string" &&
                        event.description
                            ? event.description
                            : null,
                    closed:
                        typeof event.closed === "string" ? event.closed : null,
                    latest: point,
                };
            };
            return {
                status,
                total: data.events.length,
                events: data.events.map(project),
            };
        },
    ],
];
