import { z } from "zod";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function hex(value, width) {
    return value.toString(16).padStart(width, "0");
}

// RFC 9562 version 7: 48-bit big-endian Unix milliseconds, then version and
// variant bits, then random data. Time-ordered, which is why it is asked for.
function uuidv7(now = Date.now()) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const millis = BigInt(now);
    for (let index = 0; index < 6; index += 1)
        bytes[index] = Number((millis >> BigInt(8 * (5 - index))) & 0xffn);
    bytes[6] = (bytes[6] & 0x0f) | 0x70;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const part = (start, end) =>
        Array.from(bytes.slice(start, end), (byte) => hex(byte, 2)).join("");
    return `${part(0, 4)}-${part(4, 6)}-${part(6, 8)}-${part(8, 10)}-${part(10, 16)}`;
}

function uuidv4() {
    return crypto.randomUUID();
}

// ULID: 48-bit millisecond timestamp in Crockford base32, then 80 random bits.
function ulid(now = Date.now()) {
    let time = "";
    let remaining = BigInt(now);
    for (let index = 0; index < 10; index += 1) {
        time = CROCKFORD[Number(remaining % 32n)] + time;
        remaining /= 32n;
    }
    const random = crypto.getRandomValues(new Uint8Array(16));
    let bits = 0n;
    for (const byte of random) bits = (bits << 8n) | BigInt(byte);
    let tail = "";
    for (let index = 0; index < 16; index += 1) {
        tail = CROCKFORD[Number(bits % 32n)] + tail;
        bits /= 32n;
    }
    return time + tail;
}

function ulidTime(value) {
    let total = 0n;
    for (const char of value.slice(0, 10)) {
        const digit = CROCKFORD.indexOf(char.toUpperCase());
        if (digit === -1) throw new Error(`"${char}" is not Crockford base32`);
        total = total * 32n + BigInt(digit);
    }
    return Number(total);
}

function inspectId(value) {
    const id = value.trim();
    if (/^[0-9A-HJKMNP-TV-Z]{26}$/i.test(id)) {
        return {
            kind: "ulid",
            canonical: id.toUpperCase(),
            timestamp: new Date(ulidTime(id.toUpperCase())).toISOString(),
            randomBits: 80,
        };
    }
    const uuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-([0-9a-f])[0-9a-f]{3}-([0-9a-f])[0-9a-f]{3}-[0-9a-f]{12}$/i.exec(
            id,
        );
    if (!uuid) throw new Error("Not a UUID or ULID");
    const version = Number.parseInt(uuid[1], 16);
    const variant = Number.parseInt(uuid[2], 16);
    const result = {
        kind: "uuid",
        version,
        // RFC 9562: the two most significant bits of byte 8 are 10.
        rfcVariant: (variant & 0b1100) === 0b1000,
        canonical: id.toLowerCase(),
    };
    if (version === 7)
        result.timestamp = new Date(
            Number.parseInt(id.replace(/-/g, "").slice(0, 12), 16),
        ).toISOString();
    if (version === 1) {
        // time_low | time_mid | time_hi, with the version nibble removed.
        const plain = id.replace(/-/g, "").toLowerCase();
        const ticks = BigInt(
            `0x${plain.slice(13, 16)}${plain.slice(8, 12)}${plain.slice(0, 8)}`,
        );
        // 100-ns intervals between 1582-10-15 and the Unix epoch.
        result.timestamp = new Date(
            Number(ticks / 10000n - 12219292800000n),
        ).toISOString();
    }
    return result;
}

export const idTools = [
    [
        "id_generate",
        "Generate time-ordered UUIDv7, random UUIDv4 or ULID identifiers, as many as a batch needs.",
        {
            kind: z.enum(["uuid7", "uuid4", "ulid"]).default("uuid7"),
            count: z.number().int().min(1).max(20).default(1),
            now: z
                .number()
                .int()
                .min(0)
                .optional()
                .describe("Epoch milliseconds for the timestamp, for tests"),
        },
        ({ kind, count, now }) => ({
            kind,
            ids: Array.from({ length: count }, () =>
                kind === "uuid4"
                    ? uuidv4()
                    : kind === "ulid"
                      ? ulid(now)
                      : uuidv7(now),
            ),
        }),
    ],
    [
        "id_inspect",
        "Explain a UUID or ULID: version, variant, and the embedded creation time for UUIDv1 and UUIDv7.",
        {
            id: z.string().min(1).max(100).describe("UUID or ULID to inspect"),
        },
        ({ id }) => inspectId(id),
    ],
];
