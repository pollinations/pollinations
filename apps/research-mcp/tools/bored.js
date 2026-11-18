// Bored API random activity. No key; the public API is keyless.
// Random-only: there is no lookup by id or keyword, just a random
// activity, optionally filtered by type and participant count.
import { z } from "zod";
import { fetchJson } from "../fetch.js";

const API_ROOT = "https://boredapi.com/api/activity";

// Every type the API actually serves, verified live one by one.
const TYPES = [
    "education",
    "recreational",
    "social",
    "diy",
    "charity",
    "cooking",
    "relaxation",
    "music",
    "busywork",
];

function toActivity(payload) {
    if (!payload || typeof payload !== "object")
        throw new Error("Bored API did not return an activity.");
    // No match answers HTTP 200 with an error field, not a 4xx — the
    // tool has to check for it itself.
    if (typeof payload.error === "string")
        throw new Error(`Bored API: ${payload.error}`);
    if (typeof payload.activity !== "string")
        throw new Error("Bored API did not return an activity.");
    return {
        activity: payload.activity,
        type: payload.type,
        participants: payload.participants,
        price: payload.price,
        accessibility: payload.accessibility,
        link: payload.link ?? "",
    };
}

export const boredTools = [
    [
        "bored_activity",
        "Suggest a random thing to do from the Bored API, optionally filtered by activity type and number of participants. Random-only — it cannot look up a specific activity. Returns the activity, type, participant count, price (0 free to 1 expensive), accessibility (0 easy to 1 hard) and a link, usually empty.",
        {
            type: z
                .enum(TYPES)
                .optional()
                .describe("Activity type, for example education or cooking."),
            participants: z
                .number()
                .int()
                .min(1)
                .max(10)
                .optional()
                .describe("Number of participants, 1 to 10."),
        },
        async ({ type, participants }) => {
            // Validate here too: zod applies only when args go through
            // the MCP server, so a direct handler call would otherwise
            // send an invalid filter upstream.
            if (type !== undefined && !TYPES.includes(type))
                throw new Error(
                    `Unknown activity type "${type}". Use one of: ${TYPES.join(", ")}.`,
                );
            if (
                participants !== undefined &&
                (!Number.isInteger(participants) ||
                    participants < 1 ||
                    participants > 10)
            )
                throw new Error(
                    "participants must be an integer from 1 to 10.",
                );
            const params = new URLSearchParams();
            if (type) params.set("type", type);
            if (participants !== undefined)
                params.set("participants", String(participants));
            const query = params.toString();
            const url = query ? `${API_ROOT}?${query}` : API_ROOT;
            return toActivity(await fetchJson(url));
        },
    ],
];
