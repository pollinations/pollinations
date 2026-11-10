import { z } from "zod";

// CRC-32 (IEEE 802.3), the checksum inside zip entries, PNG chunks and gzip
// trailers, so a caller can confirm bytes match what another tool produced.
const TABLE = Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1)
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    return value >>> 0;
});

export function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

function fromHex(value) {
    const clean = value.replace(/\s+/g, "");
    if (!/^(?:[0-9a-fA-F]{2})*$/.test(clean))
        throw new Error("Input is not valid hex");
    return Uint8Array.from(clean.match(/../g) ?? [], (pair) =>
        Number.parseInt(pair, 16),
    );
}

function fromBase64(value) {
    const clean = value.replace(/\s+/g, "");
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean))
        throw new Error("Input is not valid base64");
    const padded = clean.padEnd(
        clean.length + ((4 - (clean.length % 4)) % 4),
        "=",
    );
    const binary = atob(padded);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export const checksumTools = [
    [
        "checksum_crc32",
        "Compute the CRC-32 (IEEE) of text, hex or base64 bytes, the checksum used by zip, PNG and gzip.",
        {
            value: z.string().max(100000).describe("Bytes to checksum"),
            from: z.enum(["text", "hex", "base64"]).default("text"),
            expected: z
                .string()
                .max(20)
                .optional()
                .describe("Hex CRC-32 to compare against; adds matches"),
        },
        ({ value, from, expected }) => {
            const bytes =
                from === "hex"
                    ? fromHex(value)
                    : from === "base64"
                      ? fromBase64(value)
                      : new TextEncoder().encode(value);
            const sum = crc32(bytes);
            const hex = sum.toString(16).padStart(8, "0");
            return {
                crc32: hex,
                decimal: sum,
                byteLength: bytes.length,
                ...(expected === undefined
                    ? {}
                    : {
                          matches:
                              expected
                                  .trim()
                                  .toLowerCase()
                                  .replace(/^0x/, "") === hex,
                      }),
            };
        },
    ],
];
