import { describe, expect, it } from "vitest";
import {
    assertTranscriptionDurationWithinLimit,
    getMaxTranscriptionPreflightPrice,
    MAX_TRANSCRIPTION_SECONDS,
    parsePositiveInt,
    requireMaxTranscriptionBudget,
} from "../src/routes/audio.ts";

describe("parsePositiveInt", () => {
    it("returns undefined for null/empty input", () => {
        expect(parsePositiveInt(null, "speakers_expected")).toBeUndefined();
        expect(parsePositiveInt("", "speakers_expected")).toBeUndefined();
        expect(parsePositiveInt("   ", "speakers_expected")).toBeUndefined();
    });

    it("accepts positive integers", () => {
        expect(parsePositiveInt("1", "speakers_expected")).toBe(1);
        expect(parsePositiveInt("32", "speakers_expected")).toBe(32);
        expect(parsePositiveInt("999", "speakers_expected")).toBe(999);
    });

    it("rejects non-integers, zero, negatives", () => {
        for (const v of ["0", "-1", "1.5", "abc", "NaN"]) {
            expect(() => parsePositiveInt(v, "speakers_expected")).toThrowError(
                /speakers_expected must be a positive integer/,
            );
        }
    });
});

describe("transcription budget preflight", () => {
    it("prices the maximum accepted transcription duration", () => {
        expect(getMaxTranscriptionPreflightPrice("whisper")).toBeCloseTo(
            0.1602,
        );
        expect(getMaxTranscriptionPreflightPrice("scribe")).toBeCloseTo(0.33);
    });

    it("rejects finite API key budgets below the maximum transcription price", async () => {
        const vars = {
            auth: {
                user: { id: "transcription-user" },
                apiKey: { id: "sk-test", pollenBalance: 0.01 },
            },
            balance: {
                getBalance: async () => ({
                    tierBalance: 10,
                    packBalance: 10,
                }),
            },
            model: { requested: "whisper", resolved: "whisper" },
        };

        await expect(
            requireMaxTranscriptionBudget(vars as never),
        ).rejects.toMatchObject({
            status: 402,
        });
    });

    it("rejects paid-only transcription when pack balance cannot cover the maximum", async () => {
        const vars = {
            auth: {
                user: { id: "transcription-user" },
                apiKey: { id: "sk-test", pollenBalance: 1 },
            },
            balance: {
                getBalance: async () => ({
                    tierBalance: 10,
                    packBalance: 0.01,
                }),
            },
            model: { requested: "scribe", resolved: "scribe" },
        };

        await expect(
            requireMaxTranscriptionBudget(vars as never),
        ).rejects.toMatchObject({
            status: 402,
        });
    });

    it("accepts transcription budgets that cover the maximum", async () => {
        const vars = {
            auth: {
                user: { id: "transcription-user" },
                apiKey: { id: "sk-test", pollenBalance: 1 },
            },
            balance: {
                getBalance: async () => ({
                    tierBalance: 1,
                    packBalance: 0,
                }),
            },
            model: { requested: "whisper", resolved: "whisper" },
        };

        await expect(requireMaxTranscriptionBudget(vars as never)).resolves.toBe(
            undefined,
        );
        expect(
            (vars.balance as { balanceCheckResult?: unknown })
                .balanceCheckResult,
        ).toMatchObject({
            selectedMeterSlug: "v1:meter:tier",
        });
    });

    it("rejects provider-reported durations above the maximum", () => {
        expect(() =>
            assertTranscriptionDurationWithinLimit(
                MAX_TRANSCRIPTION_SECONDS + 1,
            ),
        ).toThrow(/transcription limit/);
    });
});
