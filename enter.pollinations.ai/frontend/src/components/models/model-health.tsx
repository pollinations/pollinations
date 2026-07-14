import { CheckIcon, cn, Tooltip, UsageIcon } from "@pollinations/ui";
import { useEffect, useState } from "react";

const HEALTH_WINDOW_MINUTES = 24 * 60;
const MIN_HEALTH_REQUESTS = 20;

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
};

const metricFormatter = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
});

function successColor(successRate: number): string {
    if (successRate >= 99) return "text-intent-success-text";
    if (successRate >= 95) return "text-intent-warning-text";
    return "text-intent-danger-text";
}

export function ModelHealthSummary({
    health,
    className,
    showTooltips = true,
}: ModelHealthSummaryProps) {
    if (!health) return null;

    if (health.eligibleRequests < MIN_HEALTH_REQUESTS) {
        const limitedData = (
            <span className="text-theme-text-muted">Limited traffic</span>
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

    const success = (
        <span
            className={cn(
                "inline-flex items-center gap-1 font-medium",
                successColor(health.successRate),
            )}
        >
            <CheckIcon className="h-3.5 w-3.5" />
            {metricFormatter.format(health.successRate)}% success
        </span>
    );
    const speed =
        health.tokensPerSecond == null ? null : (
            <span className="inline-flex items-center gap-1 text-theme-text-muted">
                <UsageIcon className="h-3.5 w-3.5" />
                {metricFormatter.format(health.tokensPerSecond)} tok/s
            </span>
        );

    return (
        <span
            className={cn(
                "inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-xs",
                className,
            )}
        >
            {showTooltips ? (
                <Tooltip
                    triggerAs="span"
                    content={`${health.successfulRequests.toLocaleString("en-US")} of ${health.eligibleRequests.toLocaleString("en-US")} eligible requests succeeded in the last 24 hours. Client errors are excluded.`}
                >
                    {success}
                </Tooltip>
            ) : (
                success
            )}
            {speed &&
                (showTooltips ? (
                    <Tooltip
                        triggerAs="span"
                        content="Completion tokens per second across successful, uncached requests in the last 24 hours. Includes time to first token."
                    >
                        {speed}
                    </Tooltip>
                ) : (
                    speed
                ))}
        </span>
    );
}
