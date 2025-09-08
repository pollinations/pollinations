import {
    createExecutionContext,
    createScheduledController,
    env,
} from "cloudflare:test";
import { randomBytes } from "node:crypto";
import { beforeAll, beforeEach, expect, test } from "vitest";
import type { InsertPolarEvent } from "../src/db/schema/event";
import worker from "../src/index.tsx";
import { storePolarEvents } from "../src/polar";
import { setupFetchMock } from "./mocks/fetch.ts";
import { createMockPolar } from "./mocks/polar.ts";

const mockPolar = createMockPolar();

beforeAll(() => {
    setupFetchMock(mockPolar.handlerMap, { logRequests: true });
});

beforeEach(() => mockPolar.reset());

function createTextGenerationEvent(
    overrides: Partial<InsertPolarEvent> = {},
): InsertPolarEvent {
    return {
        id: `text-${randomBytes(16).toString("hex")}`,
        name: "text_generation",
        userId: "user-0000000000000000",
        requestId: "request-0000000000000000",
        metadata: {
            model: "agi-1",
            usageInputTokens: 100,
            usageOutputTokens: 200,
            usageReasoningTokens: 50,
            pricePerMillionInputTokens: 10,
            pricePerMillionOutputTokens: 20,
            pricePerMillionReasoningTokens: 15,
            totalPrice: 0.005,
        },
        ...overrides,
    };
}

function createImageGenerationEvent(
    overrides: Partial<InsertPolarEvent> = {},
): InsertPolarEvent {
    return {
        id: `${randomBytes(16).toString("hex")}`,
        name: "image_generation",
        userId: "user-0000000000000000",
        requestId: "request-0000000000000000",
        metadata: {
            model: "agi-1",
            totalPrice: 0.05,
        },
        ...overrides,
    };
}

test("Scheduled handler sends events to Polar.sh", async () => {
    const events = Array.from({ length: 10000 }).map((_, i) => {
        if (i % 2 === 0) return createImageGenerationEvent();
        else return createTextGenerationEvent();
    });
    await storePolarEvents(events, env);
    const controller = createScheduledController();
    const ctx = createExecutionContext();
    await worker.scheduled(controller, env, ctx);
    expect(mockPolar.state.events).toHaveLength(events.length);
});
