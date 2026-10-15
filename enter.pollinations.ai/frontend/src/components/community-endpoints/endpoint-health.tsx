import { Alert, Button, Collapsible } from "@pollinations/ui";
import type { InferResponseType } from "hono/client";
import { useState } from "react";
import { accountClient } from "../../api.ts";
import { type CommunityEndpointTestResponse, readError } from "./types.ts";

type Failure = InferResponseType<
    (typeof accountClient)["my-models"][":id"]["failures"]["$get"],
    200
>["data"][number];

type TestResult = { ok: boolean; message?: string };

// Owner-only view of a model's recent failed calls, plus a live upstream test
// with the saved token. Loads on first expand so closed cards cost nothing.
export function EndpointHealth({
    id,
    testable,
}: {
    id: string;
    testable: boolean;
}) {
    const [expanded, setExpanded] = useState(false);
    const [failures, setFailures] = useState<Failure[] | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<TestResult | null>(null);

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
                <span className="text-sm font-medium text-theme-text-strong">
                    Health
                    <span className="ml-2 text-xs font-normal text-theme-text-muted">
                        Failed calls in the last 7 days
                        {testable && " and a live test"}
                    </span>
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
                {testable && (
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
                    {failure.failures} failed · {failure.counted} counted
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
