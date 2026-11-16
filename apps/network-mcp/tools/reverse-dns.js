import ipaddr from "ipaddr.js";
import { z } from "zod";
import { validAddress } from "./cidr.js";
import { lookup } from "./dns.js";

export function reverseName(address) {
    if (!validAddress(address))
        throw new Error("Use dotted-decimal IPv4 or zone-free IPv6.");

    const parsed = ipaddr.parse(address);
    const bytes = parsed.toByteArray();
    if (parsed.kind() === "ipv4")
        return `${bytes.reverse().join(".")}.in-addr.arpa`;

    const nibbles = bytes
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("")
        .split("")
        .reverse()
        .join(".");
    return `${nibbles}.ip6.arpa`;
}

export const reverseDnsTools = [
    [
        "reverse_dns",
        "Resolve PTR records for an IPv4 or IPv6 address through Cloudflare's public DNS-over-HTTPS resolver. Returns the reverse query name, DNS status, hostnames and TTLs. No caller credentials are sent. An empty answer reflects this resolver's view and does not prove no host exists.",
        {
            ip: z
                .string()
                .trim()
                .min(1)
                .max(100)
                .refine(validAddress, "Use dotted-decimal IPv4 or zone-free IPv6."),
        },
        async ({ ip }) => {
            const query = reverseName(ip);
            const response = await lookup(query, "PTR");
            return {
                ip: ipaddr.parse(ip).toString(),
                query,
                status: response.Status,
                ptr_records: (response.Answer ?? [])
                    .filter((answer) => answer.type === 12)
                    .map((answer) => ({
                        hostname: answer.data,
                        ttl: answer.TTL,
                    })),
            };
        },
    ],
];
