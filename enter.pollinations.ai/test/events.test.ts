import {
    createExecutionContext,
    createScheduledController,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import {
    calculateCost,
    calculatePrice,
    getActivePriceDefinition,
    getServiceDefinition,
    type ModelId,
    resolveServiceId,
    type ServiceId,
    type TokenUsage,
} from "@shared/registry/registry.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { expect } from "vitest";
import {
    type EventStatus,
    event,
    type InsertGenerationEvent,
    priceToEventParams,
    usageToEventParams,
} from "@/db/schema/event.ts";
import { getPendingSpend, processEvents, storeEvents } from "@/events.ts";
import worker from "@/index.ts";
import { exponentialBackoffDelay, generateRandomId } from "@/util.ts";
import { test } from "./fixtures.ts";

function createTextGenerationEvent({
    modelRequested,
    eventStatus = "pending",
    simulateTinybirdError = false,
    simulatePolarError = false,
}: {
    modelRequested: ServiceId;
    eventStatus?: EventStatus;
    simulateTinybirdError?: boolean;
    simulatePolarError?: boolean;
}): InsertGenerationEvent {
    const userId = generateRandomId();
    const resolvedModelRequested = resolveServiceId(modelRequested);

    const modelUsed = getServiceDefinition(resolvedModelRequested).modelId;
    const priceDefinition = getActivePriceDefinition(resolvedModelRequested);
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
    const cost = calculateCost(modelUsed as ModelId, usage);
    const price = calculatePrice(resolvedModelRequested, usage);

    const eventId = [
        simulateTinybirdError ? `simulate_tinybird_error` : "",
        simulatePolarError ? `simulate_polar_error` : "",
        generateRandomId(),
    ].join(":");

    return {
        id: eventId,
        requestId: generateRandomId(),
        requestPath: "/api/generate/openai",
        startTime: new Date(),
        endTime: new Date(Date.now() + 100),
        responseTime: 0,
        responseStatus: 200,
        environment: env.ENVIRONMENT,
        eventType: "generate.text",
        eventProcessingId: undefined,
        eventStatus,
        polarDeliveryAttempts: undefined,
        polarDeliveredAt: undefined,
        tinybirdDeliveryAttempts: undefined,
        tinybirdDeliveredAt: undefined,
        createdAt: undefined,
        updatedAt: undefined,
        userId,
        userTier: "seed",
        userGithubId: "12345",
        userGithubUsername: "test_user",
        apiKeyId: "test_api_key_id",
        apiKeyName: "test_api_key_name",
        apiKeyType: "secret",
        selectedMeterId: "test_selected_meter_id",
        selectedMeterSlug: "test_selected_meter_slug",
        balances: undefined,
        referrerDomain: "localhost:3000",
        referrerUrl: "http://localhost:3000",
        modelRequested,
        resolvedModelRequested,
        modelUsed,
        modelProviderUsed: "azure-openai",
        isBilledUsage: true,

        ...priceToEventParams(priceDefinition),
        ...usageToEventParams(usage),

        totalPrice: price.totalPrice,
        totalCost: cost.totalCost,

        moderationPromptHateSeverity: "safe",
        moderationPromptSelfHarmSeverity: "safe",
        moderationPromptSexualSeverity: "safe",
        moderationPromptViolenceSeverity: "safe",
        moderationPromptJailbreakDetected: false,
        moderationCompletionHateSeverity: "safe",
        moderationCompletionSelfHarmSeverity: "safe",
        moderationCompletionSexualSeverity: "safe",
        moderationCompletionViolenceSeverity: "safe",
        moderationCompletionProtectedMaterialCodeDetected: false,
        moderationCompletionProtectedMaterialTextDetected: false,

        cacheHit: false,
        cacheType: "exact",
        cacheSemanticSimilarity: undefined,
        cacheSemanticThreshold: undefined,
        cacheKey: undefined,

        errorResponseCode: undefined,
        errorSource: undefined,
        errorMessage: undefined,
    };
}

test("Scheduled handler sends events to Polar.sh and Tinybird", async ({
    log,
    mocks,
}) => {
    await mocks.enable("polar", "tinybird");
    const db = drizzle(env.DB);
    const events = Array.from({ length: 1000 }).map(() => {
        return createTextGenerationEvent({
            modelRequested: "openai-large",
        });
    });
    log.info("Adding {numEvents} events", { numEvents: events.length });
    await storeEvents(db, log, events);
    const controller = createScheduledController();
    const ctx = createExecutionContext();
    await worker.scheduled(controller, env, ctx);
    expect(mocks.polar.state.events).toHaveLength(events.length);
    expect(mocks.tinybird.state.events).toHaveLength(events.length);
});

test("Events get set to error status after MAX_DELIVERY_ATTEMPTS", async ({
    log,
    mocks,
}) => {
    await mocks.enable("polar", "tinybird");
    const db = drizzle(env.DB);
    const events = [
        ...Array.from({ length: 500 }).map(() => {
            return createTextGenerationEvent({
                modelRequested: "openai-large",
                simulateTinybirdError: false,
                simulatePolarError: false,
            });
        }),
        ...Array.from({ length: 500 }).map(() => {
            return createTextGenerationEvent({
                modelRequested: "openai-large",
                simulateTinybirdError: true,
                simulatePolarError: false,
            });
        }),
        ...Array.from({ length: 500 }).map(() => {
            return createTextGenerationEvent({
                modelRequested: "openai-large",
                simulateTinybirdError: false,
                simulatePolarError: true,
            });
        }),
    ];
    log.info("Adding {numEvents} events", { numEvents: events.length });
    await storeEvents(db, log, events);
    for (const _ of [Array.from({ length: 10 })]) {
        await processEvents(db, log, {
            polarAccessToken: env.POLAR_ACCESS_TOKEN,
            polarServer: env.POLAR_SERVER,
            tinybirdIngestUrl: env.TINYBIRD_INGEST_URL,
            tinybirdIngestToken: env.TINYBIRD_INGEST_TOKEN,
            minRetryDelay: 0,
            maxRetryDelay: 0,
            batchDeliveryDelay: 0,
        });
    }
    expect(mocks.tinybird.state.events).toHaveLength(1000);
    expect(mocks.polar.state.events).toHaveLength(1000);
    const errorEvents = await db
        .select()
        .from(event)
        .where(eq(event.eventStatus, "error"));
    expect(errorEvents).toHaveLength(1000);
    errorEvents.forEach((event) => {
        if (event.id.includes("simulate_tinybird_error")) {
            expect(event.tinybirdDeliveryAttempts).toEqual(5);
            expect(event.polarDeliveryAttempts).toEqual(1);
            expect(event.polarDeliveredAt).toBeDefined();
        }
        if (event.id.includes("simulate_polar_error")) {
            expect(event.polarDeliveryAttempts).toEqual(5);
            expect(event.tinybirdDeliveryAttempts).toEqual(1);
            expect(event.tinybirdDeliveredAt).toBeDefined();
        }
    });
});

test("Events are not processed if count is below minBatchSize and events are recent", async ({
    log,
    mocks,
}) => {
    await mocks.enable("polar", "tinybird");
    const db = drizzle(env.DB);
    const events = Array.from({ length: 50 }).map(() => {
        return createTextGenerationEvent({
            modelRequested: "openai-large",
        });
    });
    log.info("Adding {numEvents} events (below min batch size)", {
        numEvents: events.length,
    });
    await storeEvents(db, log, events);

    const controller = createScheduledController();
    const ctx = createExecutionContext();
    await worker.scheduled(controller, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(mocks.polar.state.events).toHaveLength(0);
    expect(mocks.tinybird.state.events).toHaveLength(0);

    const pendingEvents = await db
        .select()
        .from(event)
        .where(eq(event.eventStatus, "pending"));
    expect(pendingEvents).toHaveLength(50);
});

test("Events are processed if count meets minBatchSize threshold", async ({
    log,
    mocks,
}) => {
    await mocks.enable("polar", "tinybird");
    const db = drizzle(env.DB);
    const events = Array.from({ length: 150 }).map(() => {
        return createTextGenerationEvent({
            modelRequested: "openai-large",
        });
    });
    log.info("Adding {numEvents} events (above min batch size)", {
        numEvents: events.length,
    });
    await storeEvents(db, log, events);

    const controller = createScheduledController();
    const ctx = createExecutionContext();
    await worker.scheduled(controller, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(mocks.polar.state.events).toHaveLength(150);
    expect(mocks.tinybird.state.events).toHaveLength(150);
});

test("Events are processed if older than 30 seconds even if below minBatchSize", async ({
    log,
    mocks,
}) => {
    await mocks.enable("polar", "tinybird");
    const db = drizzle(env.DB);
    const events = Array.from({ length: 50 }).map(() => {
        return createTextGenerationEvent({
            modelRequested: "openai-large",
        });
    });
    log.info("Adding {numEvents} old events (below min batch size)", {
        numEvents: events.length,
    });
    await storeEvents(db, log, events);

    const oldTimestamp = new Date(Date.now() - 60 * 1000);
    await db
        .update(event)
        .set({ createdAt: oldTimestamp })
        .where(eq(event.eventStatus, "pending"));

    const controller = createScheduledController();
    const ctx = createExecutionContext();
    await worker.scheduled(controller, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(mocks.polar.state.events).toHaveLength(50);
    expect(mocks.tinybird.state.events).toHaveLength(50);
});

test("Expired sent events are cleared after processing", async ({
    log,
    mocks,
}) => {
    await mocks.enable("polar", "tinybird");
    const db = drizzle(env.DB);
    const events = Array.from({ length: 150 }).map(() => {
        return createTextGenerationEvent({
            modelRequested: "openai-large",
        });
    });
    log.info("Adding {numEvents} events", { numEvents: events.length });
    await storeEvents(db, log, events);

    const controller = createScheduledController();
    const ctx = createExecutionContext();
    await worker.scheduled(controller, env, ctx);
    await waitOnExecutionContext(ctx);

    const sentEvents = await db
        .select()
        .from(event)
        .where(eq(event.eventStatus, "sent"));
    expect(sentEvents).toHaveLength(150);

    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await db
        .update(event)
        .set({ createdAt: twoDaysAgo })
        .where(eq(event.eventStatus, "sent"));

    const newEvents = Array.from({ length: 100 }).map(() => {
        return createTextGenerationEvent({
            modelRequested: "openai-large",
        });
    });
    await storeEvents(db, log, newEvents);
    await worker.scheduled(controller, env, ctx);
    await waitOnExecutionContext(ctx);

    const remainingEvents = await db.select().from(event);
    const remainingSentEvents = remainingEvents.filter(
        (e) => e.eventStatus === "sent",
    );
    expect(remainingSentEvents).toHaveLength(100);
});

test("Exponential backoff delay", async () => {
    const backoffConfig = {
        minDelay: 100,
        maxDelay: 10000,
        maxAttempts: 5,
        jitter: 0,
    };
    expect(exponentialBackoffDelay(1, backoffConfig)).toBe(100);
    expect(exponentialBackoffDelay(3, backoffConfig)).toBeGreaterThan(100);
    expect(exponentialBackoffDelay(3, backoffConfig)).toBeLessThan(10000);
    expect(exponentialBackoffDelay(5, backoffConfig)).toBe(10000);
    const backoffConfigWithJitter = {
        minDelay: 100,
        maxDelay: 10000,
        maxAttempts: 5,
        jitter: 0.1,
    };
    expect(
        exponentialBackoffDelay(1, backoffConfigWithJitter),
    ).toBeGreaterThanOrEqual(100 - 100 * 0.1);
    expect(
        exponentialBackoffDelay(1, backoffConfigWithJitter),
    ).toBeLessThanOrEqual(100 + 100 * 0.1);
    expect(
        exponentialBackoffDelay(3, backoffConfigWithJitter),
    ).toBeGreaterThanOrEqual(100 - 100 * 0.1);
    expect(
        exponentialBackoffDelay(3, backoffConfigWithJitter),
    ).toBeLessThanOrEqual(10000 + 10000 * 0.1);
    expect(
        exponentialBackoffDelay(5, backoffConfigWithJitter),
    ).toBeGreaterThanOrEqual(10000 - 10000 * 0.1);
    expect(
        exponentialBackoffDelay(5, backoffConfigWithJitter),
    ).toBeLessThanOrEqual(10000 + 10000 * 0.1);
});

test("getPendingSpend returns 0 for user with no events", async () => {
    const db = drizzle(env.DB);
    const userId = generateRandomId();
    const spend = await getPendingSpend(db, userId);
    expect(spend).toBe(0);
});

test("getPendingSpend sums estimatedPrice for estimate events", async ({
    log,
}) => {
    const db = drizzle(env.DB);
    const userId = generateRandomId();

    const pendingEvents: InsertGenerationEvent[] = [
        {
            ...createTextGenerationEvent({ modelRequested: "openai-large" }),
            userId,
            eventStatus: "estimate",
            isBilledUsage: false,
            estimatedPrice: 0.05,
            totalPrice: 0,
        },
        {
            ...createTextGenerationEvent({ modelRequested: "openai-large" }),
            userId,
            eventStatus: "estimate",
            isBilledUsage: false,
            estimatedPrice: 0.03,
            totalPrice: 0,
        },
    ];

    await storeEvents(db, log, pendingEvents);
    const spend = await getPendingSpend(db, userId);
    expect(spend).toBeCloseTo(0.08, 5);
});

test("getPendingSpend sums totalPrice for billed events", async ({ log }) => {
    const db = drizzle(env.DB);
    const userId = generateRandomId();

    const billedEvents: InsertGenerationEvent[] = [
        {
            ...createTextGenerationEvent({ modelRequested: "openai-large" }),
            userId,
            eventStatus: "pending",
            isBilledUsage: true,
            estimatedPrice: null,
            totalPrice: 0.1,
        },
        {
            ...createTextGenerationEvent({ modelRequested: "openai-large" }),
            userId,
            eventStatus: "pending",
            isBilledUsage: true,
            estimatedPrice: null,
            totalPrice: 0.15,
        },
    ];

    await storeEvents(db, log, billedEvents);
    const spend = await getPendingSpend(db, userId);
    expect(spend).toBeCloseTo(0.25, 5);
});

test("getPendingSpend combines estimate and billed events", async ({ log }) => {
    const db = drizzle(env.DB);
    const userId = generateRandomId();

    const mixedEvents: InsertGenerationEvent[] = [
        {
            ...createTextGenerationEvent({ modelRequested: "openai-large" }),
            userId,
            eventStatus: "estimate",
            isBilledUsage: false,
            estimatedPrice: 0.05,
            totalPrice: 0,
        },
        {
            ...createTextGenerationEvent({ modelRequested: "openai-large" }),
            userId,
            eventStatus: "pending",
            isBilledUsage: true,
            estimatedPrice: null,
            totalPrice: 0.1,
        },
    ];

    await storeEvents(db, log, mixedEvents);
    const spend = await getPendingSpend(db, userId);
    expect(spend).toBeCloseTo(0.15, 5);
});
