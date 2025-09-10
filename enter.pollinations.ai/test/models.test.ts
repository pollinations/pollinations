import { REGISTRY } from "@/registry";
import { SELF } from "cloudflare:test";
import { batches } from "@/util";
import { test } from "./fixtures.ts";
import { afterEach, beforeEach, expect } from "vitest";
import { setupFetchMock, teardownFetchMock } from "./mocks/fetch";
import { createGithubMockHandlers } from "./mocks/github";
import { createMockPolar } from "./mocks/polar";
import { env } from "cloudflare:workers";

const mockPolar = createMockPolar();

const mockHandlers = {
    ...createGithubMockHandlers(),
    ...mockPolar.handlerMap,
};

beforeEach(() => setupFetchMock(mockHandlers));
afterEach(() => teardownFetchMock());

test("Send a request for each available service", async ({ apiKey }) => {
    const requests = REGISTRY.getServices().map((service) => {
        return SELF.fetch(`http://localhost:3000/api/generate/openai`, {
            method: "POST",
            headers: {
                "x-api-key": apiKey,
                "referer": env.TESTING_REFERRER,
            },
            body: JSON.stringify({
                model: service,
                messages: [
                    { role: "user", content: "Hello, whats going on today?" },
                ],
            }),
        });
    });

    for (const batch of batches(requests, 4)) {
        const responses = await Promise.all(batch);
        for (const response of responses) {
            expect(response.status).toBe(200);
        }
    }
}, 30000);
