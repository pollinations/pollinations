/**
 * Color strings for chart libraries (Recharts) that can't read CSS vars
 * from a `fill` prop. For Tailwind className consumers, use the named
 * utilities (`bg-paid-soft`, `text-paid-deep`, `bg-tier-soft`, etc.) —
 * bridged from `@pollinations_ai/ui/website.css`.
 *
 * These values mirror the **soft** chip-background colors so chart bars
 * and paid/tier chips read as the same visual identity. Hover is handled
 * via CSS opacity in chart.tsx, no separate color needed.
 */

export const PAID_COLOR = "oklch(0.93 0.09 95.746)"; // matches --polli-color-paid-pale
export const TIER_COLOR = "oklch(0.93 0.06 55)"; // matches --polli-color-tier-pale
