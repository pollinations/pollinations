import type {
    UptimeHealth,
    UptimeWindowStatus,
} from "../../../hooks/useModelUptime";

// Green -> yellow -> red gradient, plus a neutral grey for "not enough
// data yet". Plain hex values on purpose: this reads as a status signal,
// so it should stay legible regardless of the active theme.
const HEALTH_COLOR: Record<UptimeHealth, string> = {
    healthy: "#4ade80",
    degraded: "#facc15",
    down: "#f87171",
    unknown: "#9ca3af",
};

const HEALTH_LABEL: Record<UptimeHealth, string> = {
    healthy: "Healthy",
    degraded: "Degraded",
    down: "Down",
    unknown: "Insufficient data",
};

function windowTitle(status: UptimeWindowStatus): string {
    const health = HEALTH_LABEL[status.health];
    if (status.health === "unknown") {
        return `${status.label}: ${health} (${status.requests} request${status.requests === 1 ? "" : "s"})`;
    }
    const rate =
        status.successRate === null
            ? ""
            : ` - ${status.successRate.toFixed(1)}% success`;
    return `${status.label}: ${health}${rate} (${status.requests} requests)`;
}

interface UptimeDotsProps {
    statuses: UptimeWindowStatus[];
    className?: string;
}

/**
 * Three small dots representing rolling 1h / 24h / 7d uptime for a
 * community model. Each dot is colored on a green -> yellow -> red
 * gradient, or grey when there isn't enough traffic yet to judge health.
 * Hover/focus a dot for the window it represents.
 */
export function UptimeDots({ statuses, className = "" }: UptimeDotsProps) {
    if (statuses.length === 0) return null;

    return (
        <span
            className={`inline-flex items-center gap-[3px] ${className}`}
            aria-hidden="true"
        >
            {statuses.map((status) => (
                <span
                    key={status.key}
                    title={windowTitle(status)}
                    className="inline-block h-[6px] w-[6px] rounded-full shrink-0"
                    style={{ backgroundColor: HEALTH_COLOR[status.health] }}
                />
            ))}
        </span>
    );
}
