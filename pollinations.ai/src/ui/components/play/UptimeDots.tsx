import type { UptimeHealth, UptimeStatus } from "../../../hooks/useModelUptime";

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

function statusTitle(status: UptimeStatus): string {
    const health = HEALTH_LABEL[status.health];
    if (status.health === "unknown") {
        return `24h uptime: ${health} (${status.requests} request${status.requests === 1 ? "" : "s"})`;
    }
    const rate =
        status.successRate === null
            ? ""
            : ` - ${status.successRate.toFixed(1)}% success`;
    return `24h uptime: ${health}${rate} (${status.requests} requests)`;
}

interface UptimeDotsProps {
    status: UptimeStatus;
    className?: string;
}

/**
 * A single dot representing a community model's rolling 24h uptime,
 * colored on a green -> yellow -> red gradient, or grey when there isn't
 * enough traffic yet to judge health. Hover/focus for details.
 */
export function UptimeDots({ status, className = "" }: UptimeDotsProps) {
    return (
        <span
            title={statusTitle(status)}
            className={`inline-block h-[6px] w-[6px] rounded-full shrink-0 ${className}`}
            style={{ backgroundColor: HEALTH_COLOR[status.health] }}
            aria-hidden="true"
        />
    );
}
