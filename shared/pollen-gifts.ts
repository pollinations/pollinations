import { bytesToHex } from "./client-ip.ts";
import { POLLEN_PACKS } from "./pollen-packs.ts";

export const POLLEN_GIFT_PURPOSE = "pollen_gift";
export const POLLEN_GIFT_AMOUNTS = [5, 10, 20, 50, 100] as const;
export type PollenGiftAmount = (typeof POLLEN_GIFT_AMOUNTS)[number];
export const POLLEN_GIFT_DEFAULT_AMOUNT = 20 satisfies PollenGiftAmount;

const POLLEN_GIFT_AMOUNT_SET = new Set<number>(POLLEN_GIFT_AMOUNTS);

export const POLLEN_GIFT_PACKS = POLLEN_PACKS.filter((pack) =>
    POLLEN_GIFT_AMOUNT_SET.has(pack.amountUsd),
);

const POLLEN_GIFT_PREFIX = "POLLEN";
const POLLEN_GIFT_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const POLLEN_GIFT_BODY_LENGTH = 26;

export function isValidPollenGiftAmount(
    value: unknown,
): value is PollenGiftAmount {
    return typeof value === "number" && POLLEN_GIFT_AMOUNT_SET.has(value);
}

export function generatePollenGiftCode(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const encoded = encodeBase32(bytes);
    const groups = encoded.match(/.{1,5}/g) ?? [encoded];
    return `${POLLEN_GIFT_PREFIX}-${groups.join("-")}`;
}

export function normalizePollenGiftCode(value: string): string | null {
    if (value.length > 80) return null;
    const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const body = compact.startsWith(POLLEN_GIFT_PREFIX)
        ? compact.slice(POLLEN_GIFT_PREFIX.length)
        : compact;

    if (
        body.length !== POLLEN_GIFT_BODY_LENGTH ||
        [...body].some((character) => !POLLEN_GIFT_ALPHABET.includes(character))
    ) {
        return null;
    }

    return body;
}

export async function hashPollenGiftCode(
    value: string,
): Promise<string | null> {
    const normalized = normalizePollenGiftCode(value);
    if (!normalized) return null;

    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(normalized),
    );
    return bytesToHex(digest);
}

function encodeBase32(bytes: Uint8Array): string {
    let result = "";
    let buffer = 0;
    let bufferedBits = 0;

    for (const byte of bytes) {
        buffer = (buffer << 8) | byte;
        bufferedBits += 8;

        while (bufferedBits >= 5) {
            bufferedBits -= 5;
            result +=
                POLLEN_GIFT_ALPHABET[(buffer >>> bufferedBits) & 31] ?? "";
        }
    }

    if (bufferedBits > 0) {
        result +=
            POLLEN_GIFT_ALPHABET[(buffer << (5 - bufferedBits)) & 31] ?? "";
    }

    return result;
}
