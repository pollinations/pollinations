import {
    createExecutionContext,
    createScheduledController,
    env,
} from "cloudflare:test";
import { test } from "./fixtures.ts";
import worker from "../src/index.ts";
import { storeEvents } from "../src/events.ts";
import {
    event,
    priceToEventParams,
    usageToEventParams,
    type InsertGenerationEvent,
} from "@/db/schema/event.ts";
import { generateRandomId } from "@/util.ts";
import {
    ModelId,
    ServiceId,
    TokenUsage,
    resolveServiceId,
    getServiceDefinition,
    getActivePriceDefinition,
    calculateCost,
    calculatePrice,
} from "@shared/registry/registry.ts";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { expect } from "vitest";

function createTextGenerationEvent({
    modelRequested,
    simulateTinybirdError = false,
    simulatePolarError = false,
}: {
    modelRequested: ServiceId;
    simulateTinybirdError?: boolean;
    simulatePolarError?: boolean;
}): InsertGenerationEvent {
    const userId = generateRandomId();
    const resolvedModelRequested = resolveServiceId(
        modelRequested,
        "generate.text",
    );

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

    let eventId = [
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
        eventStatus: undefined,
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
        modelProviderUsed: undefined,
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
    const events = Array.from({ length: 2000 }).map(() => {
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
    const controller = createScheduledController();
    const ctx = createExecutionContext();
    for (const _ of [Array.from({ length: 10 })]) {
        await worker.scheduled(controller, env, ctx);
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
