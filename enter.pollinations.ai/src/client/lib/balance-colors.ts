/**
 * Hex constants for chart libraries that can't read CSS vars.
 *
 * Recharts (and similar) need raw color strings for `fill` props. For Tailwind
 * className consumers, use the named utilities (`bg-paid`, `text-paid-deep`,
 * `bg-tier`, `text-tier-deep`) — defined as `--color-paid` etc. in
 * `style.css @theme` — instead of importing these constants.
 */

export const PAID_COLOR = {
    base: "#E08A52",
    hover: "#C97540",
} as const;

export const TIER_COLOR = {
    base: "#FCD34D",
    hover: "#EAB818",
} as const;
