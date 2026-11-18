// Launch Library 2 upcoming rocket launches.
import { z } from "zod";
import { getJson } from "../fetch.js";

const API_ROOT = "https://ll.thespacedevs.com/2.2.0";

function launchSummary(launch) {
    const rocket = launch.rocket?.configuration ?? {};
    const mission = launch.mission ?? {};
    const pad = launch.pad ?? {};
    return {
        id: launch.id ?? null,
        name: launch.name ?? null,
        net: launch.net ?? null,
        status: launch.status?.name ?? null,
        rocket: rocket.name ?? null,
        rocket_family: rocket.family ?? null,
        mission: mission.name ?? null,
        mission_type: mission.type ?? null,
        orbit: mission.orbit?.name ?? null,
        pad: pad.name ?? null,
        location: pad.location?.name ?? null,
        url: launch.url ?? null,
    };
}

export const launchLibraryTools = [
    [
        "launches_upcoming",
        "List upcoming rocket launches from Launch Library 2: name, launch time (net), status, rocket, mission, orbit, pad and location. Launch Library 2 rate-limits anonymous requests, so frequent calls may be throttled.",
        z.object({
            limit: z
                .number()
                .int()
                .min(1)
                .max(20)
                .default(5)
                .describe("Maximum number of upcoming launches to return."),
        }),
        async ({ limit = 5 } = {}) => {
            const data = await getJson(
                `${API_ROOT}/launch/upcoming/?limit=${limit}`,
            );
            if (!Array.isArray(data?.results))
                throw new Error(
                    "Launch Library 2 did not return a launch list.",
                );
            return {
                total: data.count ?? data.results.length,
                launches: data.results.map(launchSummary),
            };
        },
    ],
];
