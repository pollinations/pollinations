import { z } from "zod";

// Two polynomials, both used reflected, which is why the constants look bit-reversed
// against their names: the IEEE one written as 0x04C11DB7 becomes 0xEDB88320 here, and
// Castagnoli's 0x1EDC6F41 becomes 0x82F63B78. Getting that reflection wrong is the usual
// way a hand-written CRC-32 disagrees with every real implementation while still
// producing plausible-looking output, so the check values are pinned in the tests.
const VARIANTS = {
    crc32: 0xedb88320,
    crc32c: 0x82f63b78,
};

function tableFor(polynomial) {
    const table = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
        let remainder = index;
        for (let bit = 0; bit < 8; bit += 1)
            remainder =
                remainder & 1
                    ? polynomial ^ (remainder >>> 1)
                    : remainder >>> 1;
        table[index] = remainder >>> 0;
    }
    return table;
}

const TABLES = Object.fromEntries(
    Object.entries(VARIANTS).map(([name, polynomial]) => [
        name,
        tableFor(polynomial),
    ]),
);

function checksum(bytes, table) {
    let remainder = 0xffffffff;
    for (const byte of bytes)
        remainder = table[(remainder ^ byte) & 0xff] ^ (remainder >>> 8);
    return (remainder ^ 0xffffffff) >>> 0;
}

export const crc32Tools = [
    [
        "crc32_checksum",
        "Compute a CRC-32 checksum of text as eight lowercase hex digits, locally. Two variants: crc32 is the IEEE polynomial (ISO-HDLC) used by zip, gzip and PNG chunks; crc32c is Castagnoli's, used by ext4, iSCSI and the SSE4.2 instruction. The text is encoded as UTF-8 first, and the input is limited to 100000 characters because the whole value is buffered.",
        {
            text: z
                .string()
                .max(100000)
                .describe("Text to checksum; encoded as UTF-8."),
            variant: z
                .enum(["crc32", "crc32c"])
                .default("crc32")
                .describe(
                    "crc32 is the IEEE polynomial (zip, gzip, PNG); crc32c is Castagnoli's (ext4, iSCSI).",
                ),
        },
        ({ text, variant }) => ({
            checksum: checksum(new TextEncoder().encode(text), TABLES[variant])
                .toString(16)
                .padStart(8, "0"),
        }),
    ],
];
