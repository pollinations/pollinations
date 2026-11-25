import { z } from "zod";

function parseMac(address) {
    const cleaned = address.trim();
    // Remove common separators : - .
    const hexOnly = cleaned.replace(/[:.-]/g, "");

    if (!/^[0-9a-fA-F]{12}$/.test(hexOnly)) {
        throw new Error(
            "Invalid MAC address: must be 12 hex characters (e.g. 00:1A:2B:3C:4D:5E or 001a.2b3c.4d5e)",
        );
    }

    const normalizedHex = hexOnly.toLowerCase();
    const bytes = [];
    for (let i = 0; i < 12; i += 2) {
        bytes.push(normalizedHex.slice(i, i + 2));
    }

    const colonFormat = bytes.join(":");
    const hyphenFormat = bytes.join("-");
    const dotFormat = `${normalizedHex.slice(0, 4)}.${normalizedHex.slice(4, 8)}.${normalizedHex.slice(8, 12)}`;

    const firstByte = Number.parseInt(bytes[0], 16);
    const isMulticast = (firstByte & 0x01) === 1;
    const isUnicast = !isMulticast;
    const isLocallyAdministered = (firstByte & 0x02) === 2;
    const isUniversallyAdministered = !isLocallyAdministered;
    const isBroadcast = normalizedHex === "ffffffffffff";

    return {
        input: address,
        valid: true,
        formats: {
            colon: colonFormat,
            hyphen: hyphenFormat,
            cisco_dot: dotFormat,
            raw_hex: normalizedHex,
        },
        properties: {
            type: isBroadcast
                ? "broadcast"
                : isMulticast
                  ? "multicast"
                  : "unicast",
            administration: isLocallyAdministered ? "local" : "universal",
            is_broadcast: isBroadcast,
            is_multicast: isMulticast,
            is_unicast: isUnicast,
            is_locally_administered: isLocallyAdministered,
            is_universally_administered: isUniversallyAdministered,
        },
        oui_prefix: colonFormat.slice(0, 8),
    };
}

export const macTools = [
    [
        "inspect_mac",
        "Inspect and normalize an IEEE 802 MAC-48 / EUI-48 address. Returns colon, hyphen and Cisco dot formats, along with unicast/multicast/broadcast and universal/local administration properties. Runs locally with zero network calls.",
        {
            address: z
                .string()
                .trim()
                .min(1)
                .max(50)
                .describe(
                    "MAC address in colon, hyphen, dot, or raw hex format",
                ),
        },
        ({ address }) => parseMac(address),
    ],
];
