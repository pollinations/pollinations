import { describe, it, expect, beforeAll } from "vitest";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:16384";

beforeAll(() => {
    console.log(`Testing usage headers against: ${BASE_URL}`);
});

describe("Usage headers (Issue #4638)", () => {
    it("should include x-model-used header in image response", async () => {
        const response = await fetch(
            `${BASE_URL}/prompt/test?model=flux`,
        );

        expect(response.status).toBe(200);
        
        const modelUsed = response.headers.get("x-model-used");
        expect(modelUsed).toBeTruthy();
        expect(typeof modelUsed).toBe("string");
        expect(modelUsed?.length).toBeGreaterThan(0);
    }, 30000);

    it("should include x-usage-completion-image-tokens header", async () => {
        const response = await fetch(
            `${BASE_URL}/prompt/test?model=flux`,
        );

        expect(response.status).toBe(200);
        
        const completionTokens = response.headers.get("x-usage-completion-image-tokens");
        expect(completionTokens).toBeTruthy();
        
        const tokenCount = parseInt(completionTokens || "0", 10);
        expect(tokenCount).toBeGreaterThan(0);
        expect(Number.isInteger(tokenCount)).toBe(true);
    }, 30000);

    it("should include x-usage-total-tokens header", async () => {
        const response = await fetch(
            `${BASE_URL}/prompt/test?model=flux`,
        );

        expect(response.status).toBe(200);
        
        const totalTokens = response.headers.get("x-usage-total-tokens");
        expect(totalTokens).toBeTruthy();
        
        const tokenCount = parseInt(totalTokens || "0", 10);
        expect(tokenCount).toBeGreaterThan(0);
        expect(Number.isInteger(tokenCount)).toBe(true);
    }, 30000);

    it("should have consistent token counts between headers", async () => {
        const response = await fetch(
            `${BASE_URL}/prompt/test?model=flux`,
        );

        expect(response.status).toBe(200);
        
        const completionTokens = parseInt(response.headers.get("x-usage-completion-image-tokens") || "0", 10);
        const totalTokens = parseInt(response.headers.get("x-usage-total-tokens") || "0", 10);
        
        // For image-only models, completion tokens should equal total tokens
        expect(completionTokens).toBe(totalTokens);
    }, 30000);

    it("should include usage headers for flux model", async () => {
        const testReferrer = process.env.VITE_TEST_REFERRER;
        const response = await fetch(
            `${BASE_URL}/prompt/test?model=flux`,
            {
                headers: testReferrer ? { Referer: testReferrer } : {},
            },
        );

        expect(response.status).toBe(200);
        
        // All models should have these headers
        expect(response.headers.get("x-model-used")).toBeTruthy();
        expect(response.headers.get("x-usage-completion-image-tokens")).toBeTruthy();
        expect(response.headers.get("x-usage-total-tokens")).toBeTruthy();
    }, 30000);
});
