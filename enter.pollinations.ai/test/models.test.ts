import { isFreeService, ServiceId } from "@shared/registry/registry.ts";
import { SELF } from "cloudflare:test";
import { batches } from "@/util";
import { test } from "./fixtures.ts";
import { afterEach, beforeEach, expect } from "vitest";
import { setupFetchMock, teardownFetchMock } from "./mocks/fetch";
import { createGithubMockHandlers } from "./mocks/github";
import { createMockPolar } from "./mocks/polar";
import { env } from "cloudflare:workers";
import { TEXT_SERVICES } from "@shared/registry/text.ts";

const mockPolar = createMockPolar();

const mockHandlers = {
    ...createGithubMockHandlers(),
    ...mockPolar.handlerMap,
};

beforeEach(() => setupFetchMock(mockHandlers, { logRequests: true }));
afterEach(() => teardownFetchMock());

test("Only free services should be available without an API key", async () => {
    const requests = Object.keys(TEXT_SERVICES).map((service) => {
        return {
            service,
            request: SELF.fetch(
                `http://localhost:3000/api/generate/openai/chat/completions`,
                {
                    method: "POST",
                    body: JSON.stringify({
                        model: service,
                        messages: [
                            {
                                role: "user",
                                content: "Hello, whats going on today?",
                            },
                        ],
                    }),
                },
            ),
        };
    });
    for (const batch of batches(requests, 4)) {
        const responses = await Promise.all(
            batch.map(async ({ service, request }) => ({
                service,
                response: await request,
            })),
        );
        for (const { service, response } of responses) {
            if (isFreeService(service as ServiceId)) {
                expect(response.status).toBe(200);
            } else {
                expect(response.status).toBe(401);
            }
        }
    }
}, 30000);

test("All services should be availabe with an API key", async ({ apiKey }) => {
    const requests = Object.keys(TEXT_SERVICES).map((service) => {
        return SELF.fetch(
            `http://localhost:3000/api/generate/openai/chat/completions`,
            {
                method: "POST",
                headers: {
                    "x-api-key": apiKey,
                    "referer": env.TESTING_REFERRER,
                },
                body: JSON.stringify({
                    model: service,
                    messages: [
                        {
                            role: "user",
                            content: "Hello, whats going on today?",
                        },
                    ],
                }),
            },
        );
    });
    for (const batch of batches(requests, 4)) {
        const responses = await Promise.all(batch);
        for (const response of responses) {
            expect(response.status).toBe(200);
        }
    }
}, 30000);
