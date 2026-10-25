import { Alert, Button, CheckIcon, Collapsible, XIcon } from "@pollinations/ui";
import { isModelReliable } from "@shared/model-health.ts";
import type { ModelHealth } from "@shared/registry/model-info.ts";
import type { InferResponseType } from "hono/client";
import { useEffect, useState } from "react";
import { accountClient } from "../../api.ts";
import { formatActivityPollen } from "../activity/format-activity-pollen.ts";
import { type CommunityEndpointTestResponse, readError } from "./types.ts";

type Health = InferResponseType<
    (typeof accountClient)["my-models"][":id"]["health"]["$get"],
    200
>;

type TestResult = { ok: boolean; message?: string };

const percent = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });

// Owner-only health, the same panel for models and agents. The closed row shows
// the listing verdict for public proxies, from the catalog health the card
// already has. Opening it loads the week (one Tinybird scan per load, so only on
// demand, and again on each open so new calls show up): the success rate for
// other models, a 7-day sparkline and failed calls. Proxies add a live upstream
// test with the saved token; agents add the owner's own recent runs.
export function EndpointHealth({
    id,
    proxy,
    listing,
}: {
    id: string;
    proxy: boolean;
    listing?: ModelHealth;
}) {
    const [health, setHealth] = useState<Health | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<TestResult | null>(null);

    useEffect(() => {
        if (!expanded) return;
        const loadHealth = async () => {
            setLoadError(null);
            try {
                const response = await accountClient["my-models"][
                    ":id"
                ].health.$get({ param: { id } });
                if (!response.ok) throw new Error(await readError(response));
                setHealth(await response.json());
            } catch (error) {
                setLoadError(error instanceof Error ? error.message : "Failed");
            }
        };
        void loadHealth();
    }, [expanded, id]);

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
                    <HealthSummary health={health} listing={listing} />
                </span>
            }
            expanded={expanded}
            onToggle={() => setExpanded(!expanded)}
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
                    <Alert intent="warning" title="Couldn’t load health">
                        {loadError}
                    </Alert>
                ) : !health ? (
                    <p className="text-theme-text-muted">Loading…</p>
                ) : health.failures.length === 0 ? (
                    <p className="text-theme-text-muted">
                        No failed calls in the last 7 days.
                    </p>
                ) : (
                    <>
                        <p className="text-xs text-theme-text-muted">
                            Final failures were the answer a caller got; the
                            rest were retried. Listing health uses the latest 50
                            final calls.
                        </p>
                        <ul className="grid gap-2">
                            {health.failures.map((failure) => (
                                <FailureRow
                                    key={`${failure.status}-${failure.code}-${failure.host}`}
                                    failure={failure}
                                />
                            ))}
                        </ul>
                    </>
                )}
                {health && !proxy && <Runs runs={health.runs} />}
            </div>
        </Collapsible>
    );
}

function Runs({ runs }: { runs: Health["runs"] }) {
    return (
        <div className="grid gap-2">
            <p className="text-xs font-medium text-theme-text-strong">
                Your recent runs
                <span className="ml-2 font-normal text-theme-text-muted">
                    Only your own calls; other callers’ runs stay private.
                </span>
            </p>
            {runs.length === 0 ? (
                <p className="text-theme-text-muted">
                    No calls from you in the last 7 days.
                </p>
            ) : (
                <ul className="grid gap-2">
                    {runs.map((run) => (
                        <RunRow key={run.id} run={run} />
                    ))}
                </ul>
            )}
        </div>
    );
}

function RunRow({ run }: { run: Health["runs"][number] }) {
    return (
        <li className="grid gap-1 rounded-md bg-theme-bg-subtle px-3 py-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="font-mono text-xs text-theme-text-strong">
                    {run.status} · {(run.durationMs / 1000).toFixed(1)} s ·{" "}
                    {formatActivityPollen(run.cost)} Pollen
                </span>
                <span className="text-xs text-theme-text-muted">
                    {new Date(run.startedAt).toLocaleString()}
                </span>
            </div>
            <p className="text-xs text-theme-text-muted">
                {run.modelCalls} generations · {run.toolCalls} tool calls
                {run.failedCalls > 0 && ` · ${run.failedCalls} failed`}
                {run.keyName && ` · key ${run.keyName}`}
            </p>
            {run.error && (
                <p className="font-mono text-xs text-theme-text-base [overflow-wrap:anywhere]">
                    {run.error}
                </p>
            )}
        </li>
    );
}

function HealthSummary({
    health,
    listing,
}: {
    health: Health | null;
    listing?: ModelHealth;
}) {
    const sum = (key: "succeeded" | "failed") =>
        health?.days.reduce((total, day) => total + day[key], 0) ?? 0;
    const calls = sum("succeeded") + sum("failed");
    const listingRate = listing?.success_rate ?? null;
    const rate =
        listingRate ?? (calls ? (sum("succeeded") / calls) * 100 : null);
    const reliable = isModelReliable(rate);
    const Icon = reliable ? CheckIcon : XIcon;
    return (
        <>
            {rate === null ? (
                health && (
                    <span className="text-xs text-theme-text-muted">
                        No calls in the last 7 days
                    </span>
                )
            ) : (
                <>
                    <span
                        className={`inline-flex items-center gap-1 text-xs font-medium ${reliable ? "text-intent-success-text" : "text-intent-danger-text"}`}
                    >
                        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                        {percent.format(rate)}% success
                        {listingRate !== null &&
                            ` · ${reliable ? "listed" : "hidden"} (listing needs over 80%)`}
                    </span>
                    <span className="text-xs text-theme-text-muted">
                        {listingRate !== null
                            ? `last ${listing?.requests} calls`
                            : `${calls.toLocaleString()} calls in 7 days`}
                    </span>
                </>
            )}
            {health && <Sparkline days={health.days} />}
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

function FailureRow({ failure }: { failure: Health["failures"][number] }) {
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
                    {failure.counted.toLocaleString()} final
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
