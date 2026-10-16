import { Alert, Button, CheckIcon, Collapsible, XIcon } from "@pollinations/ui";
import { isModelReliable } from "@shared/model-health.ts";
import type { InferResponseType } from "hono/client";
import { useEffect, useState } from "react";
import { accountClient } from "../../api.ts";
import { type CommunityEndpointTestResponse, readError } from "./types.ts";

type Failure = InferResponseType<
    (typeof accountClient)["my-models"][":id"]["failures"]["$get"],
    200
>["data"][number];

type Health = InferResponseType<
    (typeof accountClient)["my-models"][":id"]["health"]["$get"],
    200
>;

type TestResult = { ok: boolean; message?: string };

const percent = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });

// Owner-only health: the listing-rule success rate and a 7-day sparkline show
// on the closed row; failed calls load on first expand, plus a live upstream
// test with the saved token for proxies.
export function EndpointHealth({ id, proxy }: { id: string; proxy: boolean }) {
    const [health, setHealth] = useState<Health | "error" | null>(null);
    const [expanded, setExpanded] = useState(false);
    const [failures, setFailures] = useState<Failure[] | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<TestResult | null>(null);

    useEffect(() => {
        const loadHealth = async () => {
            try {
                const response = await accountClient["my-models"][
                    ":id"
                ].health.$get({ param: { id } });
                if (!response.ok) throw new Error(await readError(response));
                setHealth(await response.json());
            } catch {
                setHealth("error");
            }
        };
        void loadHealth();
    }, [id]);

    const loadFailures = async () => {
        setLoadError(null);
        try {
            const response = await accountClient["my-models"][
                ":id"
            ].failures.$get({ param: { id } });
            if (!response.ok) throw new Error(await readError(response));
            setFailures((await response.json()).data);
        } catch (error) {
            setLoadError(error instanceof Error ? error.message : "Failed");
        }
    };

    const runTest = async () => {
        setTesting(true);
        try {
            const response = await accountClient["my-models"][":id"].test.$post(
                { param: { id } },
            );
            setTestResult(
                response.ok
                    ? {
                          ok: true,
                          message: (
                              (await response.json()) as CommunityEndpointTestResponse
                          ).message,
                      }
                    : { ok: false, message: await readError(response) },
            );
        } catch (error) {
            setTestResult({
                ok: false,
                message: error instanceof Error ? error.message : "Failed",
            });
        } finally {
            setTesting(false);
        }
    };

    return (
        <Collapsible
            label={
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-sm font-medium text-theme-text-strong">
                        Health
                    </span>
                    <HealthSummary health={health} proxy={proxy} />
                </span>
            }
            expanded={expanded}
            onToggle={() => {
                if (!expanded && !failures) void loadFailures();
                setExpanded(!expanded);
            }}
            wrapperClassName="mt-4 border-theme-border"
        >
            <div className="grid gap-3 text-sm">
                {proxy && (
                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            type="button"
                            size="sm"
                            intent="info"
                            disabled={testing}
                            onClick={() => void runTest()}
                        >
                            {testing ? "Testing…" : "Test now"}
                        </Button>
                        <span className="text-xs text-theme-text-muted">
                            Calls your endpoint directly with the saved token.
                        </span>
                    </div>
                )}
                {testResult && (
                    <Alert
                        intent={testResult.ok ? "info" : "danger"}
                        title={
                            testResult.ok
                                ? "Your endpoint answered"
                                : "Test failed"
                        }
                    >
                        {testResult.message}
                    </Alert>
                )}
                {loadError ? (
                    <Alert intent="warning" title="Couldn’t load failures">
                        {loadError}
                    </Alert>
                ) : !failures ? (
                    <p className="text-theme-text-muted">Loading…</p>
                ) : failures.length === 0 ? (
                    <p className="text-theme-text-muted">
                        No failed calls in the last 7 days.
                    </p>
                ) : (
                    <>
                        <p className="text-xs text-theme-text-muted">
                            Counted failures were the final answer to a caller
                            and lower your listing score. The rest were retried.
                        </p>
                        <ul className="grid gap-2">
                            {failures.map((failure) => (
                                <FailureRow
                                    key={`${failure.status}-${failure.code}-${failure.host}`}
                                    failure={failure}
                                />
                            ))}
                        </ul>
                    </>
                )}
            </div>
        </Collapsible>
    );
}

function HealthSummary({
    health,
    proxy,
}: {
    health: Health | "error" | null;
    proxy: boolean;
}) {
    if (health === null) return null;
    if (health === "error" || health.successRate === null) {
        return (
            <span className="text-xs text-theme-text-muted">
                {health === "error"
                    ? "Couldn’t load health"
                    : "No calls in the last 7 days"}
            </span>
        );
    }
    const reliable = isModelReliable(health.successRate);
    const Icon = reliable ? CheckIcon : XIcon;
    return (
        <>
            <span
                className={`inline-flex items-center gap-1 text-xs font-medium ${reliable ? "text-intent-success-text" : "text-intent-danger-text"}`}
            >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {percent.format(health.successRate)}% success
                {proxy &&
                    ` · ${reliable ? "above" : "below"} the 80% listing bar`}
            </span>
            <span className="text-xs text-theme-text-muted">
                last {health.requests} calls
            </span>
            <Sparkline days={health.days} />
        </>
    );
}

// One bar per day: height is that day's success rate, colour is which side of
// the 80% line (dashed) it falls on. Days without calls show a faint stub.
function Sparkline({ days }: { days: Health["days"] }) {
    return (
        <svg
            viewBox="0 0 47 16"
            className="h-5 w-[59px]"
            role="img"
            aria-label="Success per day, last 7 days"
        >
            {days.map((day, index) => {
                const total = day.succeeded + day.failed;
                const rate = total ? (day.succeeded / total) * 100 : null;
                const height = rate === null ? 1 : Math.max(2, rate * 0.16);
                const tone =
                    rate === null
                        ? "text-theme-text-muted opacity-40"
                        : isModelReliable(rate)
                          ? "text-intent-success-text"
                          : "text-intent-danger-text";
                return (
                    <rect
                        key={day.day}
                        x={index * 7}
                        y={16 - height}
                        width="5"
                        height={height}
                        rx="1"
                        fill="currentColor"
                        className={tone}
                    >
                        <title>
                            {rate === null
                                ? `${day.day}: no calls`
                                : `${day.day}: ${percent.format(rate)}% of ${total.toLocaleString()} calls`}
                        </title>
                    </rect>
                );
            })}
            <line
                x1="0"
                x2="47"
                y1="3.2"
                y2="3.2"
                stroke="currentColor"
                strokeWidth="0.5"
                strokeDasharray="1.5 1.5"
                className="text-theme-text-muted"
            />
        </svg>
    );
}

function FailureRow({ failure }: { failure: Failure }) {
    return (
        <li className="grid gap-1 rounded-md bg-theme-bg-subtle px-3 py-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="font-mono text-xs text-theme-text-strong [overflow-wrap:anywhere]">
                    {failure.status}
                    {failure.code && ` · ${failure.code}`}
                    {failure.host && ` · from ${failure.host}`}
                </span>
                <span className="text-xs text-theme-text-muted">
                    {failure.failures.toLocaleString()} failed ·{" "}
                    {failure.counted.toLocaleString()} counted
                </span>
            </div>
            {failure.message && (
                <p className="font-mono text-xs text-theme-text-base [overflow-wrap:anywhere]">
                    {failure.message}
                </p>
            )}
            <p className="text-xs text-theme-text-muted">
                Last {new Date(failure.lastAt).toLocaleString()}
                {failure.fromPollinations > 0 &&
                    ` · ${failure.fromPollinations} from Pollinations checks`}
                {failure.fromOwner > 0 &&
                    ` · ${failure.fromOwner} from your own calls`}
            </p>
        </li>
    );
}
