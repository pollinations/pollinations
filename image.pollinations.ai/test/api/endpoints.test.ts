import { beforeAll, describe, expect, it } from "vitest";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:16384";
const PLN_ENTER_TOKEN = process.env.PLN_ENTER_TOKEN;

// Helper to add auth headers to requests
function authHeaders(): HeadersInit {
    return PLN_ENTER_TOKEN ? { "x-enter-token": PLN_ENTER_TOKEN } : {};
}

function checkCorsHeaders(response: Response) {
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-methods")).toBe(
        "GET, POST, OPTIONS",
    );
    expect(response.headers.get("access-control-allow-headers")).toBe(
        "Content-Type",
    );
}

beforeAll(() => {
    console.log(`Testing against: ${BASE_URL}`);
});

describe("/models endpoint", () => {
    it("should return available models as JSON array", async () => {
        const response = await fetch(`${BASE_URL}/models`, {
            headers: authHeaders(),
        });

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toContain(
            "application/json",
        );
        checkCorsHeaders(response);

        const models = await response.json();
        expect(Array.isArray(models)).toBe(true);
        expect(models.length).toBeGreaterThan(0);

        models.forEach((model: string) => {
            expect(typeof model).toBe("string");
            expect(model.length).toBeGreaterThan(0);
        });
    });

    it("should handle OPTIONS requests", async () => {
        const response = await fetch(`${BASE_URL}/models`, {
            method: "OPTIONS",
            headers: authHeaders(),
        });

        expect([200, 204]).toContain(response.status);
        checkCorsHeaders(response);
    });
});

describe("/prompt endpoint", () => {
    it("should generate image for simple prompt without parameters", async () => {
        const response = await fetch(
            `${BASE_URL}/prompt/a%20beautiful%20sunset`,
            { headers: authHeaders() },
        );

        try {
            expect(response.status).toBe(200);
        } catch (error) {
            console.error("Body:", await response.json());
            throw error;
        }
        expect(response.headers.get("content-type")).toContain("image/jpeg");
        checkCorsHeaders(response);

        const imageBuffer = await response.arrayBuffer();
        expect(imageBuffer.byteLength).toBeGreaterThan(1000);
    }, 30000);

    it("should generate image for all valid models", async () => {
        const modelsResponse = await fetch(`${BASE_URL}/models`, {
            headers: authHeaders(),
        });
        expect(modelsResponse.status).toBe(200);
        const models = await modelsResponse.json();
        expect(models.length).toBeGreaterThan(0);

        await Promise.all(
            models.map(async (model: string) => {
                const testReferrer = process.env.VITE_TEST_REFERRER;
                expect(testReferrer).toBeDefined();
                const response = await fetch(
                    `${BASE_URL}/prompt/cat%20playing?model=${model}`,
                    {
                        headers: {
                            ...authHeaders(),
                            Referer: testReferrer || "",
                        },
                    },
                );

                try {
                    expect(response.status).toBe(200);
                } catch (error) {
                    console.error("Body:", await response.json());
                    throw error;
                }
                expect(response.headers.get("content-type")).toContain(
                    "image/jpeg",
                );
                checkCorsHeaders(response);
            }),
        );
    }, 120000);

    it("should accept width and height parameters", async () => {
        const response = await fetch(
            `${BASE_URL}/prompt/abstract%20art?width=512&height=512`,
            { headers: authHeaders() },
        );

        try {
            expect(response.status).toBe(200);
        } catch (error) {
            console.error("Body:", await response.json());
            throw error;
        }
        expect(response.headers.get("content-type")).toContain("image/jpeg");
        checkCorsHeaders(response);
    }, 30000);

    it("should accept seed parameter for reproducible results", async () => {
        const seed = "12345";
        const alternate_seed = "666";
        const prompt = "landscape";

        const [response1, response2, response3] = await Promise.all([
            fetch(`${BASE_URL}/prompt/${prompt}?seed=${seed}`, {
                headers: authHeaders(),
            }),
            fetch(`${BASE_URL}/prompt/${prompt}?seed=${seed}`, {
                headers: authHeaders(),
            }),
            fetch(`${BASE_URL}/prompt/${prompt}?seed=${alternate_seed}`, {
                headers: authHeaders(),
            }),
        ]);

        expect(response1.status).toBe(200);
        checkCorsHeaders(response1);
        expect(response2.status).toBe(200);
        checkCorsHeaders(response2);
        expect(response3.status).toBe(200);
        checkCorsHeaders(response3);

        const image1 = await response1.arrayBuffer();
        const image2 = await response2.arrayBuffer();
        const image3 = await response3.arrayBuffer();

        // check first images are equal
        expect(image1.byteLength).toBe(image2.byteLength);

        // check last image is different
        expect(image1.byteLength).not.toBe(image3.byteLength);
    }, 60000);

    it("should handle boolean parameters", async () => {
        const response = await fetch(
            `${BASE_URL}/prompt/test%20image?enhance=true&nologo=true&safe=true`,
            { headers: authHeaders() },
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toContain("image/jpeg");
    }, 30000);

    it("should return random image for an empty prompt", async () => {
        const response = await fetch(`${BASE_URL}/prompt/`, {
            headers: authHeaders(),
        });
        expect(response.status).toBe(200);
    });
});

describe("/feed endpoint", () => {
    it("should return SSE stream", async () => {
        const response = await fetch(`${BASE_URL}/feed`, {
            headers: authHeaders(),
        });

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toContain(
            "text/event-stream",
        );
        expect(response.headers.get("cache-control")).toBe("no-cache");
        expect(response.headers.get("connection")).toBe("keep-alive");
        checkCorsHeaders(response);
    });

    it("should stream events when images are generated", async () => {
        const feedResponse = await fetch(`${BASE_URL}/feed`, {
            headers: authHeaders(),
        });
        expect(feedResponse.status).toBe(200);

        const imageResponse = await fetch(
            `${BASE_URL}/prompt/test%20feed%20event`,
            { headers: authHeaders() },
        );
        expect(imageResponse.status).toBe(200);

        feedResponse.body?.cancel();
    }, 30000);
});

describe("/register endpoint", () => {
    it("should handle GET requests to /register", async () => {
        const response = await fetch(`${BASE_URL}/register`, {
            headers: authHeaders(),
        });

        expect([200, 404, 405]).toContain(response.status);
        checkCorsHeaders(response);

        if (response.status === 200) {
            expect(response.headers.get("content-type")).toContain(
                "application/json",
            );
            const result = await response.json();
            expect(result).toBeDefined();
        }
    });

    it("should handle OPTIONS requests to /register", async () => {
        const response = await fetch(`${BASE_URL}/register`, {
            method: "OPTIONS",
            headers: authHeaders(),
        });

        expect([200, 204]).toContain(response.status);
        checkCorsHeaders(response);
    });
});

describe("Tracking headers (PR #4183)", () => {
    it("should include x-model-used header", async () => {
        const response = await fetch(`${BASE_URL}/prompt/test?model=flux`, {
            headers: authHeaders(),
        });

        expect(response.status).toBe(200);

        const modelUsed = response.headers.get("x-model-used");
        expect(modelUsed).toBeTruthy();
        expect(modelUsed).toBe("flux");
    }, 30000);

    it("should include x-completion-image-tokens header", async () => {
        const response = await fetch(`${BASE_URL}/prompt/test?model=flux`, {
            headers: authHeaders(),
        });

        expect(response.status).toBe(200);

        const completionTokens = response.headers.get(
            "x-completion-image-tokens",
        );
        expect(completionTokens).toBeTruthy();

        const tokenCount = parseInt(completionTokens || "0", 10);
        expect(tokenCount).toBeGreaterThan(0);

        // Flux should use unit-based pricing (1 token)
        expect(tokenCount).toBe(1);
    }, 30000);

    // x-user-tier header test removed - tier handling moved to enter.pollinations.ai
});

describe("Error handling", () => {
    it("should return 404 for non-existent endpoints", async () => {
        const response = await fetch(`${BASE_URL}/nonexistent`, {
            headers: authHeaders(),
        });

        expect(response.status).toBe(404);
        expect(response.headers.get("content-type")).toContain(
            "application/json",
        );
        checkCorsHeaders(response);

        const error = await response.json();
        expect(error).toHaveProperty("error");
    });

    it("should handle invalid model parameter gracefully", async () => {
        const response = await fetch(
            `${BASE_URL}/prompt/test?model=nonexistent`,
            { headers: authHeaders() },
        );

        expect([200, 400, 404]).toContain(response.status);
    }, 10000);
});
