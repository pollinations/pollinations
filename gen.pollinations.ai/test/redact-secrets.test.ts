import { describe, expect, it } from "vitest";
import { detectSecretsInTexts } from "@/utils/redact-secrets.ts";

describe("detectSecretsInTexts", () => {
    it("detects redact-wasm credential entities", () => {
        const types = detectSecretsInTexts(["key AKIAIOSFODNN7EXAMPLE"]);
        expect(types).toContain("AWS_ACCESS_KEY");
    });

    it("detects JWTs", () => {
        const types = detectSecretsInTexts([
            "token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.dGVzdHNlY3JldA",
        ]);
        expect(types).toContain("JWT_TOKEN");
    });

    it("detects unspaced Luhn-valid card numbers", () => {
        const types = detectSecretsInTexts(["card 4111111111111111"]);
        expect(types).toContain("CREDIT_DEBIT_CARD_NUMBER");
    });

    it("detects card numbers in separated groups", () => {
        const types = detectSecretsInTexts(["card 4111 1111 1111 1111"]);
        expect(types).toContain("CREDIT_DEBIT_CARD_NUMBER");
    });

    it("does not flag invalid-Luhn card numbers", () => {
        const types = detectSecretsInTexts(["card 4111111111111112"]);
        expect(types).not.toContain("CREDIT_DEBIT_CARD_NUMBER");
    });

    it("detects Pollinations secret and publishable keys", () => {
        const types = detectSecretsInTexts([
            "key sk_A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6 pk_AbCdEfGhIjKlMnOp",
        ]);
        expect(types).toContain("POLLINATIONS_SECRET_KEY");
        expect(types).toContain("POLLINATIONS_PUBLIC_KEY");
    });

    it("detects context-scored CVV", () => {
        expect(detectSecretsInTexts(["cvv: 123"])).toContain(
            "CREDIT_DEBIT_CARD_CVV",
        );
        expect(detectSecretsInTexts(["the number is 123"])).not.toContain(
            "CREDIT_DEBIT_CARD_CVV",
        );
    });

    it("detects context-scored PIN", () => {
        expect(detectSecretsInTexts(["my pin is 1234"])).toContain("PIN");
        expect(detectSecretsInTexts(["it happened in 2026"])).not.toContain(
            "PIN",
        );
    });

    it("detects context-scored card expiry", () => {
        expect(detectSecretsInTexts(["card expires 12/26"])).toContain(
            "CREDIT_DEBIT_CARD_EXPIRY",
        );
        expect(detectSecretsInTexts(["12/26"])).not.toContain(
            "CREDIT_DEBIT_CARD_EXPIRY",
        );
    });

    it("detects password fields", () => {
        expect(detectSecretsInTexts(["password: hunter2secure"])).toContain(
            "PASSWORD",
        );
    });

    it("detects checksum-valid ABA routing numbers only", () => {
        const types = detectSecretsInTexts(["routing 021000021"]);
        expect(types).toContain("US_BANK_ROUTING_NUMBER");
        expect(detectSecretsInTexts(["123456789"])).not.toContain(
            "US_BANK_ROUTING_NUMBER",
        );
    });

    it("does not flag privacy-only entities as secrets", () => {
        const types = detectSecretsInTexts([
            "email bob@example.com phone 555-123-4567",
        ]);
        expect(types.size).toBe(0);
    });

    it("returns an empty set for clean text", () => {
        expect(detectSecretsInTexts(["hello world"])).toEqual(new Set());
    });

    it("unions secret types across multiple texts", () => {
        const types = detectSecretsInTexts([
            "key AKIAIOSFODNN7EXAMPLE",
            "card 4111111111111111",
        ]);
        expect(types).toEqual(
            new Set(["AWS_ACCESS_KEY", "CREDIT_DEBIT_CARD_NUMBER"]),
        );
    });
});
