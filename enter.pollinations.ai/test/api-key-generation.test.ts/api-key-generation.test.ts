import { generateKeyChars, keyCharFromByte } from "@shared/auth/api-key.ts";
import { describe, expect, it } from "vitest";

const ALPHABET =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

describe("API key character generation", () => {
    it("maps bytes to alphabet characters uniformly", () => {
        const counts = new Map<string, number>();
        let rejected = 0;
        for (let byte = 0; byte < 256; byte++) {
            const char = keyCharFromByte(byte);
            if (char === null) {
                rejected++;
                continue;
            }
            counts.set(char, (counts.get(char) ?? 0) + 1);
        }
        expect(rejected).toBe(256 % ALPHABET.length);
        expect(counts.size).toBe(ALPHABET.length);
        for (const char of ALPHABET) {
            expect(counts.get(char)).toBe(Math.floor(256 / ALPHABET.length));
        }
    });

    it("generates keys of the requested length from the alphabet", () => {
        for (const length of [16, 32]) {
            const key = generateKeyChars(length);
            expect(key).toHaveLength(length);
            expect(key).toMatch(/^[A-Za-z0-9]+$/);
        }
    });
});
