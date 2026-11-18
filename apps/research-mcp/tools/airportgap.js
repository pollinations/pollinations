import { z } from "zod";

const API_ROOT = "https://airportgap.com/api/airports";
const IATA_PATTERN = /^[A-Z]{3}$/;

// The API answers in JSON:API shape, e.g.
//   {"data":{"id":"ORD","type":"airport","attributes":{
//     "name":"Chicago O'Hare International Airport","city":"Chicago",
//     "country":"United States","iata":"ORD","icao":"KORD",
//     "latitude":"41.9786","longitude":"-87.9048",
//     "altitude":672,"timezone":"America/Chicago"}}}
// Latitude/longitude arrive as strings and altitude is in feet (ORD 672 ft,
// LAX 125 ft — both match the airports' published elevations), so the
// projection converts the coordinates to numbers and names the unit.
// A lowercase code 404s upstream, so the handler uppercases before fetching.
function asNumber(value) {
    if (value === null || value === undefined) return null;
    const n = Number.parseFloat(value);
    return Number.isNaN(n) ? null : n;
}

function validateInput({ iata }) {
    const code = typeof iata === "string" ? iata.trim().toUpperCase() : "";
    if (!IATA_PATTERN.test(code)) {
        throw new Error(
            `Invalid IATA code "${iata}": expected three letters, e.g. ORD.`,
        );
    }
    return code;
}

export const airportGapTools = [
    [
        "airport_lookup",
        "Look up an airport by its three-letter IATA code on Airport Gap's public API, returning the airport name, city, country, IATA and ICAO codes, latitude and longitude, altitude in feet and timezone. No key needed. An unknown code is a clean error, not an empty list.",
        {
            iata: z
                .string()
                .regex(/^[A-Za-z]{3}$/)
                .describe(
                    "Three-letter IATA airport code, e.g. ORD (lowercase is accepted and uppercased)",
                ),
        },
        async ({ iata }, fetchJson) => {
            const code = validateInput({ iata });
            let data;
            try {
                data = await fetchJson(`${API_ROOT}/${code}`);
            } catch (error) {
                // An unknown code answers 404 with a JSON:API errors array.
                if (/HTTP 404/.test(error.message)) {
                    throw new Error(`No airport found for IATA code ${code}.`);
                }
                throw error;
            }
            const attributes = data?.data?.attributes;
            if (!attributes || typeof attributes !== "object") {
                throw new Error("Airport Gap returned an unexpected response.");
            }
            return {
                iata: code,
                name: attributes.name ?? null,
                city: attributes.city ?? null,
                country: attributes.country ?? null,
                icao: attributes.icao ?? null,
                latitude: asNumber(attributes.latitude),
                longitude: asNumber(attributes.longitude),
                altitude_ft: asNumber(attributes.altitude),
                timezone: attributes.timezone ?? null,
            };
        },
    ],
];
