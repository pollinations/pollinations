import ipaddr from "ipaddr.js";
import { z } from "zod";

// CIDR arithmetic and output contract from ismailbanouigu (#17974).
// Avoid silently interpreting dotted IPv4 with leading zeros as octal.
function validAddress(text) {
    if (text.includes("%")) return false;
    if (
        text.includes(".") &&
        !ipaddr.IPv4.isValidFourPartDecimal(text.split(":").at(-1))
    )
        return false;
    return (
        ipaddr.IPv4.isValidFourPartDecimal(text) || ipaddr.IPv6.isValid(text)
    );
}
export function inspect(cidr, addresses) {
    const [input, prefixText, extra] = cidr.split("/");
    if (
        extra !== undefined ||
        !validAddress(input) ||
        !/^(0|[1-9]\d{0,2})$/.test(prefixText ?? "")
    )
        throw new Error(
            "Use dotted-decimal IPv4 or zone-free IPv6 with a CIDR prefix",
        );
    const parsed = ipaddr.parseCIDR(cidr),
        [ip, prefix] = parsed;
    const version = ip.kind() === "ipv4" ? 4 : 6,
        bits = version === 4 ? 32 : 128;
    // Reuse the library's subnet operations instead of duplicating mask arithmetic.
    const family = version === 4 ? ipaddr.IPv4 : ipaddr.IPv6;
    const network = family.networkAddressFromCIDR(cidr).toString();
    const last = family.broadcastAddressFromCIDR(cidr).toString();
    return {
        cidr: `${network}/${prefix}`,
        version,
        prefix_length: prefix,
        network,
        netmask: family.subnetMaskFromPrefixLength(prefix).toString(),
        last_address: last,
        broadcast: version === 4 ? last : null,
        address_count: (1n << BigInt(bits - prefix)).toString(),
        checks: addresses.map((input) => {
            if (!validAddress(input))
                return { address: input, valid: false, contained: false };
            const candidate = ipaddr.parse(input);
            return {
                address: input,
                valid: true,
                normalized: candidate.toString(),
                contained:
                    candidate.kind() === ip.kind() && candidate.match(parsed),
            };
        }),
    };
}
export const cidrTools = [
    [
        "inspect_cidr",
        "Inspect an IPv4/IPv6 subnet and optionally check up to 20 addresses for containment. Returns network, mask, last address and total address count as a decimal string (not usable-host count). IPv6 has no broadcast. Runs locally; does not scan hosts.",
        {
            cidr: z.string().trim().min(1).max(100),
            addresses: z
                .array(z.string().trim().min(1).max(100))
                .max(20)
                .default([]),
        },
        ({ cidr, addresses }) => inspect(cidr, addresses),
    ],
];
