import { z } from "zod";
import { readResponseText } from "../../../shared/response-bytes.ts";
import { validAddress } from "./cidr.js";

// Adapted from hellway803-creator's RDAP Whois server.
// RDAP.org redirects to the authoritative registry; no caller key is forwarded.
const cache = new Map();
const MAX_CACHE = 200;
const TTL_MS = 10 * 60 * 1000;
async function lookup(kind, target) {
    const url = `https://rdap.org/${kind}/${encodeURIComponent(target)}`;
    const hit = cache.get(url);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
    const response = await fetch(url, {
        headers: {
            Accept: "application/rdap+json, application/json",
            "User-Agent": "Pollinations-Network/0.1 (hello@pollinations.ai)",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(10000),
    });
    try {
        if (!response.ok)
            throw new Error(
                `RDAP returned HTTP ${response.status}${response.status === 404 ? ": no registration data" : ""}${response.headers.has("retry-after") ? `; retry after ${response.headers.get("retry-after")}` : ""}`,
            );
        const value = JSON.parse(
            await readResponseText(
                response,
                8 * 1024 * 1024,
                () => new Error("RDAP response exceeds 8 MiB"),
            ),
        );
        if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
        cache.set(url, { at: Date.now(), value });
        return value;
    } finally {
        await response.body?.cancel();
    }
}
function events(data) {
    return Object.fromEntries(
        (data.events ?? []).map((e) => [e.eventAction, e.eventDate]),
    );
}
function entityName(data, role) {
    return (
        (data.entities ?? [])
            .filter((e) => (e.roles ?? []).includes(role))
            .map((e) =>
                (e.vcardArray?.[1] ?? [])
                    .filter((v) => v[0] === "fn")
                    .map((v) => v[3])
                    .join(" "),
            )
            .find(Boolean) ?? null
    );
}
export const rdapTools = [
    [
        "domain_whois",
        "Read authoritative public RDAP domain registration dates, registrar, nameservers and status. Results may be cached for ten minutes; registries can rate-limit requests.",
        { domain: z.string().trim().min(1).max(253) },
        async ({ domain }) => {
            const target = domain.toLowerCase().replace(/\.$/, "");
            if (
                !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/.test(
                    target,
                )
            )
                throw new Error(
                    "Use a plain ASCII/punycode domain name without a scheme, credentials or path.",
                );
            const d = await lookup("domain", target);
            return {
                domain: d.ldhName?.toLowerCase() ?? target,
                handle: d.handle ?? null,
                status: d.status ?? [],
                events: events(d),
                nameservers: (d.nameservers ?? [])
                    .map((n) => n.ldhName?.toLowerCase())
                    .filter(Boolean),
                registrar: entityName(d, "registrar"),
            };
        },
    ],
    [
        "ip_whois",
        "Read authoritative public RDAP network allocation, organization, range and registration dates for an IPv4 or zone-free IPv6 address. Country is null when the registry does not provide it.",
        { ip: z.string().trim().min(1).max(100) },
        async ({ ip }) => {
            if (!validAddress(ip))
                throw new Error(
                    "Use dotted-decimal IPv4 or zone-free IPv6 without leading-zero IPv4 components.",
                );
            const d = await lookup("ip", ip);
            return {
                handle: d.handle ?? null,
                name: d.name ?? null,
                organization: entityName(d, "registrant"),
                country: d.country ?? null,
                type: d.type ?? null,
                ipVersion: d.ipVersion ?? null,
                startAddress: d.startAddress ?? null,
                endAddress: d.endAddress ?? null,
                events: events(d),
                status: d.status ?? [],
            };
        },
    ],
];
