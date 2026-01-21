import { describe, it, expect, beforeAll } from "vitest";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:16384";
const PLN_ENTER_TOKEN = process.env.PLN_ENTER_TOKEN;

// Helper to add auth headers to requests
function authHeaders(): HeadersInit {
    return PLN_ENTER_TOKEN ? { "x-enter-token": PLN_ENTER_TOKEN } : {};
}

beforeAll(() => {
    console.log(`Testing usage headers against: ${BASE_URL}`);
});

describe("Usage headers (Issue #4638)", () => {
    it("should include x-model-used header in image response", async () => {
        const response = await fetch(`${BASE_URL}/prompt/test?model=flux`, {
            headers: authHeaders(),
        });

        expect(response.status).toBe(200);

        const modelUsed = response.headers.get("x-model-used");
        expect(modelUsed).toBeTruthy();
        expect(typeof modelUsed).toBe("string");
        expect(modelUsed?.length).toBeGreaterThan(0);
    }, 30000);

    it("should include x-usage-completion-image-tokens header", async () => {
        const response = await fetch(`${BASE_URL}/prompt/test?model=flux`, {
            headers: authHeaders(),
        });

        expect(response.status).toBe(200);

        const completionTokens = response.headers.get(
            "x-usage-completion-image-tokens",
        );
        expect(completionTokens).toBeTruthy();

        const tokenCount = parseInt(completionTokens || "0", 10);
        expect(tokenCount).toBeGreaterThan(0);
        expect(Number.isInteger(tokenCount)).toBe(true);
    }, 30000);

    it("should include usage headers for flux model", async () => {
        const testReferrer = process.env.VITE_TEST_REFERRER;
        const response = await fetch(`${BASE_URL}/prompt/test?model=flux`, {
            headers: { ...authHeaders(), Referer: testReferrer || "" },
        });

        expect(response.status).toBe(200);

        // All models should have these headers
        expect(response.headers.get("x-model-used")).toBeTruthy();
        expect(
            response.headers.get("x-usage-completion-image-tokens"),
        ).toBeTruthy();
    }, 30000);
});
