import {
    createExecutionContext,
    createScheduledController,
    env,
} from "cloudflare:test";
import { beforeAll, beforeEach, expect } from "vitest";
import { test } from "./fixtures.ts";
import worker from "../src/index.ts";
import { storeEvents } from "../src/events.ts";
import { setupFetchMock } from "./mocks/fetch.ts";
import { createMockPolar } from "./mocks/polar.ts";
import { getLogger } from "@logtape/logtape";
import { createMockTinybird } from "./mocks/tinybird.ts";
import {
    priceToEventParams,
    usageToEventParams,
    type InsertGenerationEvent,
} from "@/db/schema/event.ts";
import { generateRandomId } from "@/util.ts";
import {
    ProviderId,
    REGISTRY,
    ServiceId,
    TokenUsage,
} from "@shared/registry/registry.ts";
import { drizzle } from "drizzle-orm/d1";

const mockPolar = createMockPolar();
const mockTinybird = createMockTinybird();

const mockHandlers = {
    ...mockPolar.handlerMap,
    ...mockTinybird.handlerMap,
};

beforeAll(() => {
    setupFetchMock(mockHandlers, { logRequests: true });
});

beforeEach(() => {
    mockPolar.reset();
    mockTinybird.reset();
});

function createTextGenerationEvent(
    modelRequested: ServiceId,
): InsertGenerationEvent {
    const userId = generateRandomId();
    const resolvedModelRequested = REGISTRY.withFallbackService(
        modelRequested,
        "generate.text",
    );

    const modelUsed = REGISTRY.getServiceDefinition(resolvedModelRequested)
        .modelProviders[0];
    const priceDefinition = REGISTRY.getActivePriceDefinition(
        resolvedModelRequested,
    );
    if (!priceDefinition) {
        throw new Error(
            `Failed to get price definition for model: ${modelRequested}`,
        );
    }
    const usage: TokenUsage = {
        unit: "TOKENS",
        promptTextTokens: 1_000_000,
        completionTextTokens: 1_000_000,
    };
    const cost = REGISTRY.calculateCost(modelUsed as ProviderId, usage);
    const price = REGISTRY.calculatePrice(resolvedModelRequested, usage);

    return {
        id: generateRandomId(),
        requestId: generateRandomId(),
        startTime: new Date(),
        endTime: new Date(),
        responseTime: 0,
        responseStatus: 200,
        environment: "testing",
        eventType: "generate.text",
        eventProcessingId: undefined,
        eventStatus: undefined,
        polarDeliveryAttempts: undefined,
        polarDeliveredAt: undefined,
        tinybirdDeliveryAttempts: undefined,
        tinybirdDeliveredAt: undefined,
        createdAt: undefined,
        updatedAt: undefined,
        userId,
        userTier: "flower",
        referrerDomain: "localhost:3000",
        referrerUrl: "http://localhost:3000",
        modelRequested,
        modelUsed,
        isBilledUsage: true,

        ...priceToEventParams(priceDefinition),
        ...usageToEventParams(usage),

        totalPrice: price.totalPrice,
        totalCost: cost.totalCost,
    };
}

test("Scheduled handler sends events to Polar.sh and Tinybird", async () => {
    const db = drizzle(env.DB);
    const log = getLogger(["hono"]);
    const events = Array.from({ length: 2000 }).map(() => {
        return createTextGenerationEvent("openai-large");
    });
    await storeEvents(db, log, events);
    const controller = createScheduledController();
    const ctx = createExecutionContext();
    await worker.scheduled(controller, env, ctx);
    expect(mockPolar.state.events).toHaveLength(events.length);
    expect(mockTinybird.state.events).toHaveLength(events.length);
});
