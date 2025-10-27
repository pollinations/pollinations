// Shared database schema for auth and events
// Used by both enter.pollinations.ai and gen.pollinations.ai

import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

// User table (better-auth)
export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .default(false)
    .notNull(),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .defaultNow()
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  role: text("role"),
  banned: integer("banned", { mode: "boolean" }).default(false),
  banReason: text("ban_reason"),
  banExpires: integer("ban_expires", { mode: "timestamp" }),
  githubId: integer("github_id"),
  githubUsername: text("github_username"),
  tier: text("tier").default("seed").notNull(),
});

// API Key table (better-auth)
export const apikey = sqliteTable("apikey", {
  id: text("id").primaryKey(),
  name: text("name"),
  start: text("start"),
  prefix: text("prefix"),
  key: text("key").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  refillInterval: integer("refill_interval"),
  refillAmount: integer("refill_amount"),
  lastRefillAt: integer("last_refill_at", { mode: "timestamp" }),
  enabled: integer("enabled", { mode: "boolean" }).default(true),
  rateLimitEnabled: integer("rate_limit_enabled", { mode: "boolean" }).default(true),
  rateLimitTimeWindow: integer("rate_limit_time_window").default(1000),
  rateLimitMax: integer("rate_limit_max").default(5),
  requestCount: integer("request_count").default(0),
  remaining: integer("remaining"),
  lastRequest: integer("last_request", { mode: "timestamp" }),
  expiresAt: integer("expires_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  permissions: text("permissions"),
  metadata: text("metadata"),
  user: undefined as any, // Placeholder for drizzle relations
});

// Event table
const eventTypeValues = ["generate.text", "generate.image"] as const;
export type EventType = (typeof eventTypeValues)[number];

const eventStatusValues = ["pending", "processing", "sent", "error"] as const;
export type EventStatus = (typeof eventStatusValues)[number];

export const event = sqliteTable("event", {
    id: text("id").primaryKey(),
    requestId: text("request_id").notNull(),
    startTime: integer("start_time", { mode: "timestamp_ms" }).notNull(),
    endTime: integer("end_time", { mode: "timestamp_ms" }).notNull(),
    responseTime: real("response_time"),
    responseStatus: integer("response_status"),
    environment: text("environment"),
    eventType: text("event_type").$type<EventType>().notNull(),
    eventProcessingId: text("event_processing_id"),
    eventStatus: text("event_status", { enum: eventStatusValues })
        .$type<EventStatus>()
        .default("pending")
        .notNull(),
    polarDeliveryAttempts: integer("polar_delivery_attempts").default(0).notNull(),
    polarDeliveredAt: integer("polar_delivered_at", { mode: "timestamp" }),
    tinybirdDeliveryAttempts: integer("tinybird_delivery_attempts").default(0).notNull(),
    tinybirdDeliveredAt: integer("tinybird_delivered_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
    userId: text("user_id"),
    userTier: text("user_tier"),
    referrerUrl: text("referrer_url"),
    referrerDomain: text("referrer_domain"),
    modelRequested: text("model_requested"),
    modelUsed: text("model_used"),
    isBilledUsage: integer("is_billed_usage", { mode: "boolean" }),
    totalCost: real("total_cost"),
    totalPrice: real("total_price"),
    cacheHit: integer("cache_hit", { mode: "boolean" }),
    cacheKey: text("cache_key"),
    cacheType: text("cache_type"),
    cacheSemanticSimilarity: real("cache_semantic_similarity"),
    cacheSemanticThreshold: real("cache_semantic_threshold"),
});
