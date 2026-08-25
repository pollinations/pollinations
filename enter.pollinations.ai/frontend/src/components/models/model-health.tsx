import { cn, Tooltip } from "@pollinations/ui";
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
    stacked?: boolean;
    limitedLabel?: string;
};

const metricFormatter = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
});

function successStatus(successRate: number) {
    if (successRate >= 100) {
        return { label: "Perfect", color: "text-intent-success-text" };
    }
    if (successRate >= 99) {
        return { label: "Healthy", color: "text-intent-success-text" };
    }
    if (successRate >= 95) {
        return { label: "Unstable", color: "text-intent-warning-text" };
    }
    return { label: "Degraded", color: "text-intent-danger-text" };
}

export function ModelHealthSummary({
    health,
    className,
    showTooltips = true,
    stacked = false,
    limitedLabel = "Limited traffic",
}: ModelHealthSummaryProps) {
    if (!health) return null;

    const tokensPerSecond = health.tokensPerSecond;
    const hasSpeed = tokensPerSecond != null;
    if (health.eligibleRequests < MIN_HEALTH_REQUESTS) {
        const limitedData = (
            <span className="inline-flex items-center gap-1 text-theme-text-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-theme-border" />
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

    const status = successStatus(health.successRate);
    const success = (
        <span
            className={cn(
                "inline-flex items-center gap-1 font-medium",
                status.color,
            )}
        >
            <span aria-hidden="true" className="text-[10px]">
                ●
            </span>
            {status.label}
        </span>
    );
    const speed = hasSpeed ? (
        <span className="inline-flex items-baseline gap-1 tabular-nums">
            <span className="font-medium text-theme-text-base">
                {metricFormatter.format(tokensPerSecond)}
            </span>
            <span className="text-theme-text-muted">tok/s</span>
        </span>
    ) : null;

    if (!success && !speed) return null;

    const successMetric =
        success && showTooltips ? (
            <Tooltip
                triggerAs="span"
                content={`${metricFormatter.format(health.successRate)}% success: ${health.successfulRequests.toLocaleString("en-US")} of ${health.eligibleRequests.toLocaleString("en-US")} eligible requests succeeded in the last 24 hours. Client errors are excluded.`}
            >
                {success}
            </Tooltip>
        ) : (
            success
        );
    const speedMetric =
        speed && showTooltips ? (
            <Tooltip
                triggerAs="span"
                content="Completion tokens per second across successful, uncached text requests in the last 24 hours. Includes time to first token."
            >
                {speed}
            </Tooltip>
        ) : (
            speed
        );

    return (
        <span
            className={cn(
                "inline-flex items-center text-xs",
                stacked ? "flex-col gap-0.5" : "flex-wrap gap-x-2.5 gap-y-1",
                className,
            )}
        >
            {stacked ? (
                <>
                    {speedMetric}
                    {successMetric}
                </>
            ) : (
                <>
                    {successMetric}
                    {speedMetric}
                </>
            )}
        </span>
    );
}
