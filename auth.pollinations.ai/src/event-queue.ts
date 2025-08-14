// CURRENTLY UNUSED

import { Polar } from "@polar-sh/sdk";
import { EventCreateExternalCustomer } from "@polar-sh/sdk/models/components/eventcreateexternalcustomer.js";

export type TextGeneration = {
    type: "text_generation";
    eventId: string;
    userId: string;
    model: string;
    usage: {
        inputTokens: number;
        outputTokens: number;
        reasoningTokens: number;
    };
    tokenPricesPerMillion: {
        inputTokens: number;
        outputTokens: number;
        reasoningTokens: number;
    };
    totalPrice: number;
};

export type ImageGeneration = {
    type: "image_generation";
    eventId: string;
    userId: string;
    model: string;
    totalPrice: number;
};

export type PollenEvent = TextGeneration | ImageGeneration;

export type PollenEventBatch = {
    type: "event_batch";
    events: PollenEvent[];
    createdAt: number;
};

const EVENT_BATCH_SIZE_THRESHOLD = 1000;
const MAX_MESSAGE_AGE_THRESHOLD = 1000; // ms

export async function queueHandler(
    batch: MessageBatch<PollenEvent | PollenEventBatch>,
    env: Cloudflare.Env,
    _ctx: ExecutionContext,
): Promise<void> {
    console.log("Handling event batch:", batch);
    const eventCount = getEventCount(batch);
    console.log("Event count:", eventCount);
    const maxAge = getMaxMessageAge(batch);
    console.log("Max age:", maxAge);
    if (
        eventCount > EVENT_BATCH_SIZE_THRESHOLD ||
        maxAge > MAX_MESSAGE_AGE_THRESHOLD
    ) {
        const uniqueEvents = getUniqueEvents(batch);
        try {
            sendToPolar(uniqueEvents, env);
            batch.ackAll();
        } catch (e) {
            console.error(e);
            batch.retryAll();
        }
    } else {
        try {
            const eventBatch = {
                type: "event_batch",
                events: getUniqueEvents(batch),
            };
            env.EVENT_QUEUE.send(eventBatch, { delaySeconds: 0.1 });
            console.log("Re-enqued event batch:", eventBatch);
            batch.ackAll();
        } catch (e) {
            console.error(e);
            batch.retryAll();
        }
    }
}

function getEventCount(
    batch: MessageBatch<PollenEvent | PollenEventBatch>,
): number {
    return batch.messages
        .map((msg) => {
            const isEventBatch = msg.body.type === "event_batch";
            return isEventBatch ? msg.body.events.length : 1;
        })
        .reduce((total, count) => total + count);
}

function getMaxMessageAge(
    batch: MessageBatch<PollenEvent | PollenEventBatch>,
): number {
    const now = Date.now();
    return batch.messages
        .map((msg) => now - msg.timestamp.getTime())
        .reduce((maxAge, currentAge) => Math.max(maxAge, currentAge));
}

function getUniqueEvents(
    batch: MessageBatch<PollenEvent | PollenEventBatch>,
): PollenEvent[] {
    return Object.values(
        batch.messages
            .flatMap((msg) => {
                if (msg.body.type === "event_batch") {
                    return msg.body.events;
                }
                return msg.body;
            })
            .reduce(
                (events, event) => {
                    events[event.eventId] = event;
                    return events;
                },
                {} as { [id: string]: PollenEvent },
            ),
    );
}

async function sendToPolar(
    events: PollenEvent[],
    env: Cloudflare.Env,
): Promise<void> {
    console.log(`Sending ${events.length} events to Polar`);
    // const polar = new Polar({
    //     accessToken: env.POLAR_ACCESS_TOKEN,
    //     server: "sandbox",
    // });
    // polar.events.ingest({
    //     events: events.map((event) => mapToPolarEvent(event)),
    // });
}

function mapToPolarEvent(event: PollenEvent): EventCreateExternalCustomer {
    switch (event.type) {
        case "text_generation": {
            const { eventId, model, usage, tokenPricesPerMillion, totalPrice } =
                event;
            return {
                name: event.type,
                externalCustomerId: event.userId,
                metadata: {
                    eventId,
                    model,
                    usageInputTokens: usage.inputTokens,
                    usageOutputTokens: usage.outputTokens,
                    usageReasoningTokens: usage.reasoningTokens,
                    pricePerMillionInputTokens:
                        tokenPricesPerMillion.inputTokens,
                    pricePerMillionOutputTokens:
                        tokenPricesPerMillion.outputTokens,
                    pricePerMillionReasoningTokens:
                        tokenPricesPerMillion.reasoningTokens,
                    totalPrice,
                },
            };
        }
        case "image_generation": {
            const { eventId, model, totalPrice } = event;
            return {
                name: event.type,
                externalCustomerId: event.userId,
                metadata: {
                    eventId,
                    model,
                    totalPrice,
                },
            };
        }
    }
}
