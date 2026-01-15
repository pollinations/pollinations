/**
 * Shared types for the service registry
 * These types are used across multiple services for event tracking and pricing
 */

/**
 * Event types for generation tracking
 */
export const eventTypeValues = [
    "generate.text",
    "generate.image",
    "generate.audio",
] as const;
export type EventType = (typeof eventTypeValues)[number];
