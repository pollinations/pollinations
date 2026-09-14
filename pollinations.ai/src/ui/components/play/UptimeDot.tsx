import type { UptimeHealth, UptimeStatus } from "../../../hooks/useModelUptime";

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
    unknown: "No recent requests",
};

function getUptimeLabel(status: UptimeStatus): string {
    const requestCount = `${status.requests} request${status.requests === 1 ? "" : "s"}`;
    const successRate =
        status.successRate === null
            ? ""
            : `, ${status.successRate.toFixed(1)}% successful`;
    return `24h uptime: ${HEALTH_LABEL[status.health]} (${requestCount}${successRate})`;
}

export function UptimeDot({ status }: { status: UptimeStatus }) {
    const label = getUptimeLabel(status);

    return (
        <span
            role="img"
            title={label}
            aria-label={label}
            className="mr-1.5 inline-block h-[6px] w-[6px] shrink-0 rounded-full"
            style={{ backgroundColor: HEALTH_COLOR[status.health] }}
        />
    );
}
