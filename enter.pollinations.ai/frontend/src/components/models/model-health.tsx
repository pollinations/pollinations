import { cn, Tooltip, UsageIcon } from "@pollinations/ui";
import { useEffect, useState } from "react";

const HEALTH_WINDOW_MINUTES = 24 * 60;
export const MIN_HEALTH_REQUESTS = 5;

export type ModelHealth = {
    eligibleRequests: number;
    successfulRequests: number;
    successRate: number;
    tokensPerSecond: number | null;
};

export type ModelHealthByName = Record<string, ModelHealth>;

export type ModelHealthRow = {
    model: string;
    event_type: string;
    total_requests: number;
    status_2xx: number;
    errors_4xx: number;
    tokens_per_second: number | null;
};

type ModelHealthResponse = {
    data?: ModelHealthRow[];
};

export function mapModelHealthRows(rows: ModelHealthRow[]): ModelHealthByName {
    const healthByName: ModelHealthByName = {};

    for (const row of rows) {
        const eligibleRequests = Math.max(
            row.total_requests - row.errors_4xx,
            0,
        );
        if (eligibleRequests === 0) continue;

        healthByName[row.model] = {
            eligibleRequests,
            successfulRequests: row.status_2xx,
            successRate: (row.status_2xx / eligibleRequests) * 100,
            tokensPerSecond:
                row.event_type === "generate.text"
                    ? row.tokens_per_second
                    : null,
        };
    }

    return healthByName;
}

export function useModelHealth(): ModelHealthByName {
    const [healthByName, setHealthByName] = useState<ModelHealthByName>({});

    useEffect(() => {
        const controller = new AbortController();

        async function loadHealth(): Promise<void> {
            try {
                const { config } = await import("../../config.ts");
                const response = await fetch(
                    `${config.genBaseUrl}/v1/models/status?minutes=${HEALTH_WINDOW_MINUTES}`,
                    { signal: controller.signal },
                );
                if (!response.ok) return;

                const body = (await response.json()) as ModelHealthResponse;
                if (!controller.signal.aborted) {
                    setHealthByName(mapModelHealthRows(body.data ?? []));
                }
            } catch (error) {
                if (
                    !(
                        error instanceof DOMException &&
                        error.name === "AbortError"
                    )
                ) {
                    setHealthByName({});
                }
            }
        }

        void loadHealth();
        return () => controller.abort();
    }, []);

    return healthByName;
}

type ModelHealthSummaryProps = {
    health?: ModelHealth;
    className?: string;
    showTooltips?: boolean;
    showSuccess?: boolean;
    showSpeed?: boolean;
    limitedLabel?: string;
};

const metricFormatter = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
});

function successColor(successRate: number): string {
    if (successRate >= 99) return "text-intent-success-text";
    if (successRate >= 95) return "text-intent-warning-text";
    return "text-intent-danger-text";
}

function SuccessRing({ successRate }: { successRate: number }) {
    const value = Math.min(Math.max(successRate, 0), 100);
    return (
        <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className="h-4 w-4 shrink-0 -rotate-90"
        >
            <circle
                cx="8"
                cy="8"
                r="6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                className="text-theme-border"
            />
            <circle
                cx="8"
                cy="8"
                r="6"
                fill="none"
                pathLength="100"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray={`${value} 100`}
                className={successColor(successRate)}
            />
        </svg>
    );
}

export function ModelHealthSummary({
    health,
    className,
    showTooltips = true,
    showSuccess = true,
    showSpeed = true,
    limitedLabel = "Limited traffic",
}: ModelHealthSummaryProps) {
    if (!health) return null;

    const tokensPerSecond = health.tokensPerSecond;
    const hasSpeed = showSpeed && tokensPerSecond != null;
    if (health.eligibleRequests < MIN_HEALTH_REQUESTS) {
        if (!showSuccess && !hasSpeed) return null;
        const limitedData = (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-theme-border bg-theme-bg-pale px-2 py-1 text-theme-text-muted">
                <span className="h-2 w-2 rounded-full bg-theme-border" />
                {limitedLabel}
            </span>
        );
        return (
            <span className={cn("inline-flex text-xs", className)}>
                {showTooltips ? (
                    <Tooltip
                        triggerAs="span"
                        content={`Only ${health.eligibleRequests} eligible requests in the last 24 hours.`}
                    >
                        {limitedData}
                    </Tooltip>
                ) : (
                    limitedData
                )}
            </span>
        );
    }

    const success = showSuccess ? (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-theme-border bg-theme-bg-pale px-2 py-1 tabular-nums">
            <SuccessRing successRate={health.successRate} />
            <span className="font-semibold text-theme-text-base">
                {metricFormatter.format(health.successRate)}%
            </span>
            <span className="text-theme-text-muted">success</span>
        </span>
    ) : null;
    const speed = hasSpeed ? (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-theme-border bg-theme-bg-pale px-2 py-1 tabular-nums">
            <UsageIcon className="h-3.5 w-3.5 text-theme-text-muted" />
            <span className="font-semibold text-theme-text-base">
                {metricFormatter.format(tokensPerSecond)}
            </span>
            <span className="text-theme-text-muted">tok/s</span>
        </span>
    ) : null;

    if (!success && !speed) return null;

    return (
        <span
            className={cn(
                "inline-flex flex-wrap items-center gap-1.5 text-xs",
                className,
            )}
        >
            {success &&
                (showTooltips ? (
                    <Tooltip
                        triggerAs="span"
                        content={`${health.successfulRequests.toLocaleString("en-US")} of ${health.eligibleRequests.toLocaleString("en-US")} eligible requests succeeded in the last 24 hours. Client errors are excluded.`}
                    >
                        {success}
                    </Tooltip>
                ) : (
                    success
                ))}
            {speed &&
                (showTooltips ? (
                    <Tooltip
                        triggerAs="span"
                        content="Completion tokens per second across successful, uncached text requests in the last 24 hours. Includes time to first token."
                    >
                        {speed}
                    </Tooltip>
                ) : (
                    speed
                ))}
        </span>
    );
}
