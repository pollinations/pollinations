import { z } from "zod";
import { readResponseText } from "../../../shared/response-bytes.ts";
import { validAddress } from "./cidr.js";

// ip-api.com free endpoint; no key. The free tier allows 45 requests/minute
// and is licensed for non-commercial use — see the PR body for that caveat.
async function fetchJson(url) {
    const response = await fetch(url, {
        headers: {
            Accept: "application/json",
            "User-Agent": "Pollinations-Network/0.1 (hello@pollinations.ai)",
        },
        signal: AbortSignal.timeout(10000),
    });
    try {
        if (!response.ok)
            throw new Error(`ip-api.com returned HTTP ${response.status}`);
        return JSON.parse(
            await readResponseText(
                response,
                64 * 1024,
                () => new Error("ip-api.com response exceeds 64 KiB"),
            ),
        );
    } finally {
        await response.body?.cancel();
    }
}

const FIELDS =
    "status,message,country,countryCode,regionName,city,zip,lat,lon,timezone,isp,org,as,query";

export const geolocateTools = [
    [
        "ip_geolocate",
        "Read country, region, city, latitude/longitude, timezone, ISP, organization and ASN for a public IPv4 or zone-free IPv6 address. Private and reserved addresses are rejected by the upstream service; no self-IP lookup — the tool takes an explicit address.",
        { ip: z.string().trim().min(1).max(100) },
        async ({ ip }) => {
            if (!validAddress(ip))
                throw new Error(
                    "Use dotted-decimal IPv4 or zone-free IPv6 without leading-zero IPv4 components.",
                );
            const d = await fetchJson(
                `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=${FIELDS}`,
            );
            if (d.status !== "success")
                throw new Error(`ip-api.com: ${d.message ?? "lookup failed"}`);
            return {
                ip: d.query ?? ip,
                country: d.country ?? null,
                country_code: d.countryCode ?? null,
                region: d.regionName ?? null,
                city: d.city ?? null,
                zip: d.zip ?? null,
                latitude: d.lat ?? null,
                longitude: d.lon ?? null,
                timezone: d.timezone ?? null,
                isp: d.isp ?? null,
                org: d.org ?? null,
                as: d.as ?? null,
            };
        },
    ],
];
