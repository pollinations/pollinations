import { Alert, Collapsible } from "@pollinations/ui";
import type { InferResponseType } from "hono/client";
import { useState } from "react";
import { accountClient } from "../../api.ts";
import { formatActivityPollen } from "../activity/format-activity-pollen.ts";
import { readError } from "./types.ts";

type Run = InferResponseType<
    (typeof accountClient)["my-models"][":id"]["runs"]["$get"],
    200
>["data"][number];

// The owner's own recent calls to an agent, each with the generations and tool
// calls it made. Loads on each expand so closed cards cost nothing and a
// reopened list shows calls made since.
export function EndpointRuns({ id }: { id: string }) {
    const [expanded, setExpanded] = useState(false);
    const [runs, setRuns] = useState<Run[] | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    const loadRuns = async () => {
        setLoadError(null);
        try {
            const response = await accountClient["my-models"][":id"].runs.$get({
                param: { id },
            });
            if (!response.ok) throw new Error(await readError(response));
            setRuns((await response.json()).data);
        } catch (error) {
            setLoadError(error instanceof Error ? error.message : "Failed");
        }
    };

    return (
        <Collapsible
            label={
                <span className="text-sm font-medium text-theme-text-strong">
                    Recent runs
                    <span className="ml-2 text-xs font-normal text-theme-text-muted">
                        Your own calls in the last 7 days
                    </span>
                </span>
            }
            expanded={expanded}
            onToggle={() => {
                if (!expanded) void loadRuns();
                setExpanded(!expanded);
            }}
            wrapperClassName="mt-4 border-theme-border"
        >
            <div className="grid gap-3 text-sm">
                {loadError ? (
                    <Alert intent="warning" title="Couldn’t load runs">
                        {loadError}
                    </Alert>
                ) : !runs ? (
                    <p className="text-theme-text-muted">Loading…</p>
                ) : runs.length === 0 ? (
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
        </Collapsible>
    );
}

function RunRow({ run }: { run: Run }) {
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
