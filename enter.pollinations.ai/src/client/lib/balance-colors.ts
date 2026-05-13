/**
 * Single source of truth for the Paid / Tier balance colors used across the
 * wallet, earnings graph, and spending/usage graph. Keep these in sync.
 */

export const PAID_COLOR = {
    base: "#E08A52",
    hover: "#C97540",
    bgClass: "bg-[#E08A52]",
} as const;

export const TIER_COLOR = {
    base: "#FCD34D",
    hover: "#EAB818",
    bgClass: "bg-[#FCD34D]",
} as const;
