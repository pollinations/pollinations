import { isFreeService, getTextServices } from "@shared/registry/registry.ts";
import { SELF } from "cloudflare:test";
import { test } from "./fixtures.ts";
import { describe, beforeEach, expect } from "vitest";
import { env } from "cloudflare:workers";

const anonymousTestCases = (allowAnoymous: boolean) => {
    return getTextServices().map((serviceId) => [
        serviceId,
        isFreeService(serviceId) && allowAnoymous ? 200 : 401,
    ]);
};

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
                                    content: "Hello, whats going on today?",
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

// Send a request to each text model, using the x-api-key header
test.for(getTextServices())(
    "%s should respond with 200 when x-api-key header",
    { timeout: 30000 },
    async (serviceId, { apiKey }) => {
        const response = await SELF.fetch(
            `http://localhost:3000/api/generate/openai`,
            {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    "x-api-key": apiKey,
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
