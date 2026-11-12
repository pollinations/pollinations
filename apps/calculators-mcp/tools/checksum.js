import { z } from "zod";

// Keyless checksum suggested in the #19450 review. It is not a cryptographic
// hash, so it takes no key and reveals nothing a caller did not already send.
const text = z
    .string()
    .min(1)
    .max(8000)
    .refine((value) => [...value].length <= 4000, "Maximum 4000 code points");

// Reflected polynomial 0xedb88320, the variant zip, PNG and gzip use.
const TABLE = Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit++)
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    return value >>> 0;
});
function crc32(bytes) {
    let value = 0xffffffff;
    for (const byte of bytes)
        value = TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
    return (value ^ 0xffffffff) >>> 0;
}
export const checksumTools = [
    [
        "checksum_crc32",
        "Compute the CRC-32 (IEEE 802.3) checksum of UTF-8 text, the checksum zip archives and PNG chunks use. It catches accidental corruption; it is not a cryptographic hash and must not be used to verify authenticity.",
        { text },
        ({ text }) => {
            const bytes = new TextEncoder().encode(text),
                value = crc32(bytes);
            return {
                bytes: bytes.length,
                crc32: value.toString(16).padStart(8, "0"),
                decimal: value,
            };
        },
    ],
];
