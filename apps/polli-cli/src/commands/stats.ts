import { Command } from "commander";
import ora from "ora";
import { getOutputMode, printError, printTable } from "../lib/output.js";

const TINYBIRD_HOST = "https://api.europe-west2.gcp.tinybird.co";
// Read-only public token (same as model-monitor dashboard)
const TINYBIRD_TOKEN =
    "p.eyJ1IjogImFjYTYzZjc5LThjNTYtNDhlNC05NWJjLWEyYmFjMTY0NmJkMyIsICJpZCI6ICJmZTRjODM1Ni1iOTYwLTQ0ZTYtODE1Mi1kY2UwYjc0YzExNjQiLCAiaG9zdCI6ICJnY3AtZXVyb3BlLXdlc3QyIn0.Wc49vYoVYI_xd4JSsH_Fe8mJk7Oc9hx0IIldwc1a44g";

const PIPES: Record<string, string> = {
    "5m": "model_health",
    "60m": "model_health_60m",
    "24h": "model_health_24h",
    "7d": "model_health_7d",
};

interface TinybirdRow {
    model: string;
    event_type: string;
    total_requests: number;
    status_2xx: number;
    total_errors: number;
    avg_latency_ms: number;
    latency_p50_ms: number;
    latency_p95_ms: number;
    last_request_at: string;
}

interface TinybirdResponse {
    data: TinybirdRow[];
}

function statusLabel(errorRate: number): string {
    if (errorRate > 50) return "down";
    if (errorRate > 10) return "degraded";
    return "up";
}

function fmtRate(total: number, windowMinutes: number): string {
    const perHour = (total / windowMinutes) * 60;
    if (perHour >= 1000) return `${(perHour / 1000).toFixed(1)}k/hr`;
    return `${Math.round(perHour)}/hr`;
}

const WINDOW_MINUTES: Record<string, number> = {
    "5m": 5,
    "60m": 60,
    "24h": 1440,
    "7d": 10080,
};

export const statsCommand = new Command("stats")
    .description("Show model health and performance stats")
    .option("--type <type>", "Filter: text, image, audio, video, all", "all")
    .option("--window <window>", "Time window: 5m, 60m, 24h, 7d", "60m")
    .action(async (opts) => {
        const window = opts.window as string;
        const typeFilter = opts.type as string;

        const pipeName = PIPES[window];
        if (!pipeName) {
            printError(
                `Invalid window "${window}". Use: ${Object.keys(PIPES).join(", ")}`,
            );
            process.exit(1);
        }

        const isHuman = getOutputMode() === "human";
        const spinner = isHuman
            ? ora(`Fetching model stats (${window} window)...`).start()
            : null;

        try {
            const url = `${TINYBIRD_HOST}/v0/pipes/${pipeName}.json?token=${TINYBIRD_TOKEN}`;
            const res = await fetch(url, {
                signal: AbortSignal.timeout(15_000),
            });

            if (!res.ok) {
                throw new Error(`Tinybird API error: ${res.status}`);
            }

            const body = (await res.json()) as TinybirdResponse;
            let rows = body.data ?? [];

            // Filter by event_type if requested
            if (typeFilter !== "all") {
                rows = rows.filter((r) => r.event_type === typeFilter);
            }

            // Sort by total_requests descending (already sorted, but ensure)
            rows.sort((a, b) => b.total_requests - a.total_requests);

            const windowMin = WINDOW_MINUTES[window];
            const tableRows = rows.map((r) => {
                const errorRate =
                    r.total_requests > 0
                        ? (r.total_errors / r.total_requests) * 100
                        : 0;
                return {
                    model: r.model,
                    type: r.event_type,
                    status: statusLabel(errorRate),
                    "req/hr": fmtRate(r.total_requests, windowMin),
                    "err%": `${errorRate.toFixed(1)}%`,
                    "p50 ms": String(r.latency_p50_ms ?? "-"),
                    "p95 ms": String(r.latency_p95_ms ?? "-"),
                };
            });

            spinner?.stop();
            printTable(tableRows, [
                "model",
                "type",
                "status",
                "req/hr",
                "err%",
                "p50 ms",
                "p95 ms",
            ]);
        } catch (err) {
            spinner?.stop();
            printError(
                `Failed to fetch stats: ${err instanceof Error ? err.message : "unknown"}`,
            );
            process.exit(1);
        }
    });
