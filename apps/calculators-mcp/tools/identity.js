import { z } from "zod";

// Keyless counterpart to the rejected encoding server (#19450): nothing here needs
// a secret, so it can inspect an identifier the caller already has.
const identifier = z.string().min(1).max(200);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
// 100 ns ticks between 1582-10-15 (the UUID epoch) and 1970-01-01.
const UUID_EPOCH_MS = 12219292800000;

function variantOf(nibble) {
    const value = Number.parseInt(nibble, 16);
    if (value <= 7) return "NCS";
    if (value <= 11) return "RFC 9562";
    if (value <= 13) return "Microsoft";
    return "future";
}
function timestamps(milliseconds) {
    const facts = { timestamp_ms: milliseconds };
    // Date only accepts values within ±8.64e15 ms; a wild tick count must not throw.
    if (milliseconds >= 0 && milliseconds <= 8.64e15)
        facts.timestamp = new Date(milliseconds).toISOString();
    return facts;
}
function uuidFacts(hex) {
    const version = Number.parseInt(hex[12], 16),
        facts = { version, variant: variantOf(hex[16]) };
    if (version === 1) {
        // time_hi_and_version holds the version in its first nibble.
        const ticks =
            (BigInt(`0x${hex.slice(13, 16)}`) << 48n) |
            (BigInt(`0x${hex.slice(8, 12)}`) << 32n) |
            BigInt(`0x${hex.slice(0, 8)}`);
        Object.assign(
            facts,
            timestamps(Number(ticks / 10000n) - UUID_EPOCH_MS),
        );
    } else if (version === 6)
        Object.assign(
            facts,
            timestamps(
                Number(
                    (BigInt(`0x${hex.slice(0, 8)}`) << 28n) |
                        (BigInt(`0x${hex.slice(8, 12)}`) << 12n) |
                        BigInt(`0x${hex.slice(13, 16)}`),
                ) /
                    10000n -
                    BigInt(UUID_EPOCH_MS),
            ),
        );
    else if (version === 7)
        Object.assign(facts, timestamps(Number.parseInt(hex.slice(0, 12), 16)));
    if (version === 3 || version === 5)
        facts.note =
            "Hash-based: the name and namespace cannot be recovered from the identifier.";
    else if (version === 4)
        facts.note = "Random: no timestamp or input is embedded.";
    if (hex === "0".repeat(32)) facts.note = "Nil UUID: every bit is zero.";
    if (hex === "f".repeat(32)) facts.note = "Max UUID: every bit is one.";
    return facts;
}
function ulidFacts(value) {
    let milliseconds = 0;
    for (const character of value.slice(0, 10).toUpperCase())
        milliseconds = milliseconds * 32 + CROCKFORD.indexOf(character);
    return {
        ...timestamps(milliseconds),
        note: "The first 10 characters are a 48-bit millisecond timestamp; the other 16 are random.",
    };
}
export const identityTools = [
    [
        "id_inspect",
        "Read what an identifier claims to be: UUID version and variant, with the embedded timestamp for v1, v6 and v7, or a ULID's timestamp. It parses the string you already have and never contacts a network; a version or timestamp is a claim, not proof of authenticity.",
        { id: identifier },
        ({ id }) => {
            const value = id.trim();
            if (UUID.test(value))
                return {
                    input: id,
                    type: "uuid",
                    normalized: value.toLowerCase(),
                    uuid: uuidFacts(value.replaceAll("-", "").toLowerCase()),
                };
            if (ULID.test(value))
                return {
                    input: id,
                    type: "ulid",
                    normalized: value.toUpperCase(),
                    ulid: ulidFacts(value),
                };
            return {
                input: id,
                type: "unknown",
                normalized: value,
                note: "Not a canonical UUID (8-4-4-4-12 hex) or a 26-character Crockford base32 ULID.",
            };
        },
    ],
];
