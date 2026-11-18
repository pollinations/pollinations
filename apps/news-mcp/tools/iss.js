// Live position and crew of the International Space Station via open-notify.
import * as z from "zod";
import { getJson } from "../fetch.js";

const ISS_NOW = "http://api.open-notify.org/iss-now.json";
const ASTROS = "http://api.open-notify.org/astros.json";

// open-notify serves plain HTTP only (its HTTPS endpoint does not answer);
// plain-HTTP fetch works in a Cloudflare Worker (see ip_geolocate in
// network-mcp), and the shared getJson allows public http(s) hosts.
function toPosition(data) {
    if (data?.message !== "success" || !data?.iss_position)
        throw new Error("open-notify did not return an ISS position.");
    const latitude = Number(data.iss_position.latitude);
    const longitude = Number(data.iss_position.longitude);
    const timestamp = Number(data.timestamp);
    if (
        !Number.isFinite(latitude) ||
        latitude < -90 ||
        latitude > 90 ||
        !Number.isFinite(longitude) ||
        longitude < -180 ||
        longitude > 180 ||
        !Number.isFinite(timestamp)
    )
        throw new Error("open-notify returned an invalid ISS position.");
    return {
        latitude,
        longitude,
        time: new Date(timestamp * 1000).toISOString(),
    };
}

function toCrew(data) {
    if (data?.message !== "success" || !Array.isArray(data?.people))
        throw new Error("open-notify did not return a crew list.");
    return {
        crew_count: data.people.length,
        crew: data.people.map((person) => ({
            name: person.name,
            craft: person.craft,
        })),
    };
}

export const issTools = [
    [
        "iss_now",
        "Where the International Space Station is right now, and who is in space. Returns the ISS latitude/longitude and time (UTC ISO) from open-notify, plus the crew list (name and craft, ISS and Tiangong) unless crew is false. No key. open-notify is a small volunteer service with no SLA, its crew list can lag the actual crew, and it reports the position live — it does not predict passes.",
        z.object({
            crew: z.boolean().default(true),
        }),
        async ({ crew }) => {
            const [position, astros] = await Promise.all([
                getJson(ISS_NOW),
                crew ? getJson(ASTROS) : Promise.resolve(null),
            ]);
            return {
                ...toPosition(position),
                ...(astros ? toCrew(astros) : {}),
            };
        },
    ],
];
