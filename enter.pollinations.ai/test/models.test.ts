import { isFreeService, getTextServices } from "@shared/registry/registry.ts";
import { SELF } from "cloudflare:test";
import { test } from "./fixtures.ts";
import { describe, beforeEach, expect } from "vitest";
import { env } from "cloudflare:workers";

const DISABLE_CACHE = false;

const anonymousTestCases = (allowAnoymous: boolean) => {
    return getTextServices().map((serviceId) => [
        serviceId,
        isFreeService(serviceId) && allowAnoymous ? 200 : 401,
    ]);
};

const randomString = (length: number) => {
    return crypto.getRandomValues(new Uint8Array(length)).join("");
};

function testMessageContent() {
    return DISABLE_CACHE
        ? `Do you like this random string: ${randomString(10)}? Only answer yes or no.`
        : "Do you prefer 0, or 1? Just answer with 0 or 1.";
}

// Send a request to each text model without authentication
// and makes sure that the response status is in line with
// the value of ALLOW_ANONYMOUS_USAGE
describe.for([true, false])(
    "When ALLOW_ANONYMOUS_USAGE is %s",
    (allowAnoymous) => {
        beforeEach(() => {
            env.ALLOW_ANONYMOUS_USAGE = allowAnoymous;
        });
        test.for(anonymousTestCases(allowAnoymous))(
            "%s should respond %s when unauthenticated",
            { timeout: 30000 },
            async ([serviceId, expectedStatus]) => {
                const response = await SELF.fetch(
                    `http://localhost:3000/api/generate/openai`,
                    {
                        method: "POST",
                        headers: {
                            "content-type": "application/json",
                        },
                        body: JSON.stringify({
                            model: serviceId,
                            messages: [
                                {
                                    role: "user",
                                    content: testMessageContent(),
                                },
                            ],
                        }),
                    },
                );
                expect(response.status).toBe(expectedStatus);
            },
        );
    },
);

// Send a request to each text model, using the Authorization Bearer header
test.for(getTextServices())(
    "%s should respond with 200 when using API key via Bearer token",
    { timeout: 30000 },
    async (serviceId, { apiKey }) => {
        const response = await SELF.fetch(
            `http://localhost:3000/api/generate/openai`,
            {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    "authorization": `Bearer ${apiKey}`,
                    "referer": env.TESTING_REFERRER,
                },
                body: JSON.stringify({
                    model: serviceId,
                    messages: [
                        {
                            role: "user",
                            content: testMessageContent(),
                        },
                    ],
                }),
            },
        );
        expect(response.status).toBe(200);
    },
);

// Sends a request to each text model, using bearer auth
test.for(getTextServices())(
    "%s should respond with 200 when using authorization header",
    { timeout: 30000 },
    async (serviceId, { apiKey }) => {
        const response = await SELF.fetch(
            `http://localhost:3000/api/generate/openai`,
            {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    "authorization": `Bearer ${apiKey}`,
                    "referer": env.TESTING_REFERRER,
                },
                body: JSON.stringify({
                    model: serviceId,
                    messages: [
                        {
                            role: "user",
                            content: "Hello, whats going on today?",
                        },
                    ],
                }),
            },
        );
        expect(response.status).toBe(200);
    },
);
