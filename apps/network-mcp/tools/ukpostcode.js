import { z } from "zod";
import { readResponseText } from "../../../shared/response-bytes.ts";

// postcodes.io is keyless and returns one ~2 KB record per postcode. The
// record itself is wide (~40 fields), so the tool projects the dozen fields
// an agent actually needs and drops the rest (eastings/northings, ward,
// police force, deprivation index, the nested codes object). Unknown codes
// answer 404 with {"status":404,"error":"Postcode not found"}, which becomes
// a named error instead of leaking the status. Lookup only — the partial
// search endpoint (/postcodes?q=...) is deliberately not exposed here.
export async function lookupPostcode(
    postcode,
    signal = AbortSignal.timeout(10000),
) {
    const cleaned = postcode.trim().toUpperCase();
    const compact = cleaned.replace(/\s+/g, "");
    if (!/^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(compact)) {
        throw new Error(
            "Invalid UK postcode: expected an outward code and an inward code, e.g. SW1A 1AA",
        );
    }
    const response = await fetch(
        `https://api.postcodes.io/postcodes/${encodeURIComponent(cleaned)}`,
        {
            headers: {
                Accept: "application/json",
                "User-Agent":
                    "Pollinations-Network/0.1 (hello@pollinations.ai)",
            },
            redirect: "follow",
            signal,
        },
    );
    if (!response.ok) {
        await response.body?.cancel();
        throw new Error(
            `No UK postcode found for "${cleaned}" (postcodes.io returned HTTP ${response.status})`,
        );
    }
    const parsed = JSON.parse(
        await readResponseText(
            response,
            65536,
            () => new Error("Postcode response exceeds 64 KiB"),
        ),
    );
    const result = parsed?.result;
    if (!result || typeof result !== "object") {
        throw new Error(`No UK postcode found for "${cleaned}"`);
    }
    return {
        postcode: result.postcode ?? null,
        country: result.country ?? null,
        region: result.region ?? null,
        latitude: result.latitude ?? null,
        longitude: result.longitude ?? null,
        admin_district: result.admin_district ?? null,
        parish: result.parish ?? null,
        parliamentary_constituency: result.parliamentary_constituency ?? null,
        lsoa: result.lsoa ?? null,
        msoa: result.msoa ?? null,
        nhs_ha: result.nhs_ha ?? null,
        outcode: result.outcode ?? null,
        incode: result.incode ?? null,
        date_of_introduction: result.date_of_introduction ?? null,
    };
}

export const ukpostcodeTools = [
    [
        "uk_postcode",
        "Look up a UK postcode via postcodes.io. Returns the postcode's country, region, coordinates and administrative areas (district, parish, parliamentary constituency, LSOA/MSOA, NHS health authority, outcode/incode and introduction date). Lookup only — no partial search. No caller credentials are sent.",
        {
            postcode: z
                .string()
                .trim()
                .min(1)
                .max(20)
                .describe(
                    "UK postcode, with or without the space, e.g. SW1A 1AA",
                ),
        },
        ({ postcode }) => lookupPostcode(postcode),
    ],
];
