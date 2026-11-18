// Internet radio stations. No key; the Radio Browser API is public.
// The API lives on DNS-based hosts only (de1/de2.api.radio-browser.info):
// www.radio-browser.info serves the SPA HTML, not JSON.
import { z } from "zod";

const API_ROOT = "https://de1.api.radio-browser.info";

function toStation(station) {
    if (!station || typeof station.name !== "string")
        throw new Error("Radio Browser did not return a station.");
    const tags = String(station.tags ?? "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
    return {
        name: station.name.trim(),
        country: station.country ?? null,
        tags: tags.slice(0, 10),
        tagsTruncated: tags.length > 10,
        bitrate: typeof station.bitrate === "number" ? station.bitrate : null,
        votes: typeof station.votes === "number" ? station.votes : null,
        stream_url: station.url_resolved || station.url || null,
    };
}

export const radioBrowserTools = [
    [
        "radio_stations",
        "Find internet radio stations by name from Radio Browser. Returns the station name, country, tags, bitrate, votes and stream URL. The stream URL is returned, the stream itself is never fetched.",
        {
            name: z
                .string()
                .trim()
                .min(1)
                .max(200)
                .describe("Station name to search for, for example jazz."),
            limit: z
                .number()
                .int()
                .min(1)
                .max(25)
                .default(5)
                .describe("Maximum stations to return, 1 to 25."),
        },
        async ({ name, limit = 5 }, fetchJson) => {
            if (typeof name !== "string" || !name.trim())
                throw new Error("A station name is required.");
            if (
                typeof limit !== "number" ||
                !Number.isInteger(limit) ||
                limit < 1 ||
                limit > 25
            )
                throw new Error("limit must be an integer between 1 and 25.");
            const url =
                `${API_ROOT}/json/stations/search` +
                `?name=${encodeURIComponent(name.trim())}&limit=${limit}`;
            const data = await fetchJson(url);
            if (!Array.isArray(data))
                throw new Error("Radio Browser did not return a station list.");
            return {
                name: name.trim(),
                total: data.length,
                stations: data.map(toStation),
            };
        },
    ],
];
