import { z } from "zod";
import { readResponseText } from "../../../shared/response-bytes.ts";

// api.zippopotam.us — free, no key. A volunteer-run service with no SLA;
// coverage is uneven: US, DE, FR, AU and IN resolve live, while GB, CA and
// JP returned 404 for real postcodes I tried — see the PR body.
async function fetchJson(url) {
    const response = await fetch(url, {
        headers: {
            Accept: "application/json",
            "User-Agent": "Pollinations-Network/0.1 (hello@pollinations.ai)",
        },
        signal: AbortSignal.timeout(10000),
    });
    try {
        if (response.status === 404) throw new Error("postal code not found");
        if (!response.ok)
            throw new Error(
                `api.zippopotam.us returned HTTP ${response.status}`,
            );
        return JSON.parse(
            await readResponseText(
                response,
                64 * 1024,
                () => new Error("api.zippopotam.us response exceeds 64 KiB"),
            ),
        );
    } finally {
        await response.body?.cancel();
    }
}

function toNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

export const zippopotamTools = [
    [
        "postal_code_lookup",
        "Read place, state and latitude/longitude for a postal code in a supported country (US, DE, FR, AU, IN and others — coverage is limited and uneven, and some listed countries answer 404 for real codes). Takes a postal code and an ISO 3166-1 alpha-2 country code, defaulting to us.",
        {
            postal_code: z
                .string()
                .trim()
                .min(1)
                .max(20)
                .regex(
                    /^[A-Za-z0-9][A-Za-z0-9 -]*$/,
                    "Postal code must use letters, digits, spaces or hyphens.",
                ),
            country: z
                .string()
                .trim()
                .toLowerCase()
                .regex(/^[a-z]{2}$/, "Country must be a two-letter code.")
                .default("us"),
        },
        async ({ postal_code, country = "us" }) => {
            const d = await fetchJson(
                `https://api.zippopotam.us/${country}/${encodeURIComponent(postal_code)}`,
            );
            const places = (d.places ?? []).map((p) => ({
                place: p["place name"] ?? null,
                state: p.state ?? null,
                state_code: p["state abbreviation"] ?? null,
                latitude: toNumber(p.latitude),
                longitude: toNumber(p.longitude),
            }));
            if (places.length === 0) throw new Error("postal code not found");
            return {
                country: d.country ?? null,
                country_code:
                    d["country abbreviation"] ?? country.toUpperCase(),
                postal_code: d["post code"] ?? postal_code,
                places,
            };
        },
    ],
];
