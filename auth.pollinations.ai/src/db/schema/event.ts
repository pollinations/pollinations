import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const eventNameValues = ["text_generation", "image_generation"] as const;
type EventName = (typeof eventNameValues)[number];

const eventStatusValues = ["pending", "processing", "sent", "error"] as const;
type EventStatus = (typeof eventStatusValues)[number];

type TextGenerationMetadata = {
    model: string;
    usageInputTokens: number;
    usageOutputTokens: number;
    usageReasoningTokens: number;
    pricePerMillionInputTokens: number;
    pricePerMillionOutputTokens: number;
    pricePerMillionReasoningTokens: number;
    totalPrice: number;
};

type ImageGenerationMetadata = {
    model: string;
    totalPrice: number;
};

export type EventMetadata = TextGenerationMetadata | ImageGenerationMetadata;

export const event = sqliteTable("event", {
    id: text("id").primaryKey(),
    name: text("name", { enum: eventNameValues }).$type<EventName>().notNull(),
    userId: text("user_id").notNull(),
    requestId: text("request_id").notNull(),
    processingId: text("processing_id"),
    status: text("status", { enum: eventStatusValues })
        .$type<EventStatus>()
        .default("pending")
        .notNull(),
    metadata: text("metadata", { mode: "json" })
        .$type<EventMetadata>()
        .notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
        .$defaultFn(() => new Date())
        .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
        .$onUpdateFn(() => new Date())
        .notNull(),
    sentAt: integer("sent_at", { mode: "timestamp" }),
    deliveryAttempts: integer("delivery_attempts").default(0).notNull(),
});

export type InsertPolarEvent = typeof event.$inferInsert;
export type PolarEvent = typeof event.$inferSelect;
