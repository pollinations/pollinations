/**
 * Shared types for the service registry
 * These types are used across multiple services for event tracking and pricing
 */

/**
 * Event types for generation tracking
 */
export const eventTypeValues = ["generate.text", "generate.image"] as const;
export type EventType = (typeof eventTypeValues)[number];

/**
 * User tier levels for access control
 * Each tier has progressively more access to services
 * 
 * - anonymous: Unauthenticated users (free tier)
 * - seed: Default tier for authenticated users (stored in DB)
 * - flower: Premium tier
 * - nectar: Highest tier
 */
export const userTierValues = ["anonymous", "seed", "flower", "nectar"] as const;
export type UserTier = (typeof userTierValues)[number];
