import { Text } from "@pollinations/ui";

const TONE = {
    up: "text-intent-success-text",
    down: "text-intent-danger-text",
    flat: "text-theme-text-muted",
};

/**
 * Week-over-week delta. The arrow carries the direction so the reading never
 * depends on color alone.
 */
export function Trend({ change, label = "WoW", className }) {
    if (change == null || Number.isNaN(change) || !Number.isFinite(change))
        return null;
    const direction = change > 1 ? "up" : change < -1 ? "down" : "flat";
    const arrow = direction === "up" ? "▲" : direction === "down" ? "▼" : "→";
    return (
        <Text
            as="span"
            size="xs"
            className={`inline-flex items-center gap-1 tabular-nums ${TONE[direction]} ${className || ""}`}
        >
            <span aria-hidden="true">{arrow}</span>
            <span>
                {change > 0 ? "+" : ""}
                {Math.round(change)}% {label}
            </span>
        </Text>
    );
}
