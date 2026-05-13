/**
 * Color strings for chart libraries (Recharts) that can't read CSS vars
 * from a `fill` prop. For Tailwind className consumers, use the named
 * utilities (`bg-paid-soft`, `text-paid-deep`, `bg-tier-soft`, etc.) —
 * defined as `--color-paid-*` / `--color-tier-*` in `style.css @theme`.
 *
 * These values mirror the **soft** chip-background colors so chart bars
 * and paid/tier chips read as the same visual identity. Hover is handled
 * via CSS opacity in chart.tsx, no separate color needed.
 */

export const PAID_COLOR = "oklch(0.924 0.12 95.746)"; // matches --color-paid-soft (amber-200 — same as paid chip bg)
export const TIER_COLOR = "oklch(0.925 0.075 55)"; // matches --color-tier-soft (peach — same as tier chip bg)
