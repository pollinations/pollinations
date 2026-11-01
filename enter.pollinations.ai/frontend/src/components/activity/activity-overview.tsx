import {
    AppIcon,
    BeakerIcon,
    Button,
    InlineLink,
    SegmentedControl,
    Surface,
    TabButton,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
    XIcon,
} from "@pollinations/ui";
import { type FC, type ReactNode, useMemo, useState } from "react";
import { LoadError, SectionContent } from "../layout/dashboard-loading.tsx";
import {
    ActivityEmptyState,
    CsvDownloadButton,
    clearActivitySelectionOnEscape,
    PollenUsageBadges,
} from "./activity-helpers";
import { type ActivityPeriod, toggleActivityBucket } from "./activity-period";
import { ActivityPeriodNavigation } from "./activity-period-navigation";
import { Chart } from "./chart";
import type { Metric } from "./types";
import {
    ACTIVITY_SOURCES,
    type ActivityAmounts,
    type ActivityTab,
    type BreakdownEntry,
    type PickList,
    useActivityData,
} from "./use-activity-data";

/** URL state; defaults (usage, pollen, models, no picks) stay out of it. */
export type ActivitySearch = ActivityPeriod & {
    tab?: "earnings";
    metric?: "requests";
    group?: "key";
    keys?: string[];
    models?: string[];
};

const TABS = [
    { value: "usage", label: "Usage" },
    { value: "earnings", label: "Earnings" },
] as const;

const METRICS = [
    { value: "pollen", label: "Pollen" },
    { value: "requests", label: "Requests" },
] as const;

const GROUPS = [
    { value: "model", label: "Models" },
    { value: "key", label: "Keys" },
] as const;

// Same width when stacked, so both switches line up.
const CONTROL_LABEL =
    "w-10 shrink-0 text-xs text-theme-text-muted @[36rem]:w-auto";

const PICK_NOUNS: Record<ActivityTab, Record<PickList, string>> = {
    usage: { keys: "key", models: "model" },
    earnings: { keys: "app", models: "model" },
};

const EMPTY_STATES: Record<ActivityTab, ReactNode> = {
    usage: (
        <>
            No usage in this period. Once you start using the API, your
            deductions will appear here.{" "}
            <InlineLink href="/keys">Create an API key</InlineLink>.
        </>
    ),
    earnings: (
        <>
            No earnings in this period. Once users spend Pollen through your
            apps or community models, earnings will appear here.{" "}
            <InlineLink href="/keys">Create an App key</InlineLink>.
        </>
    ),
};

export const ActivityOverview: FC<{
    search: ActivitySearch;
    onChange: (changes: Partial<ActivitySearch>) => void;
}> = ({ search, onChange }) => {
    const tab = search.tab ?? "usage";
    const metric = search.metric ?? "pollen";
    const group = search.group ?? "model";
    const { granularity, period: periodName, bucket, anchor } = search;
    const period = useMemo<ActivityPeriod>(
        () => ({ granularity, period: periodName, bucket, anchor }),
        [granularity, periodName, bucket, anchor],
    );
    const picks = useMemo(
        () => ({ keys: search.keys ?? [], models: search.models ?? [] }),
        [search.keys, search.models],
    );
    const data = useActivityData({ tab, period, metric, group, picks });

    function setPeriod(next: ActivityPeriod): void {
        onChange({
            granularity: next.granularity,
            period: next.period,
            bucket: next.bucket,
            anchor: next.anchor,
        });
    }

    function setPicks(list: PickList, values: string[]): void {
        onChange({ [list]: values.length ? values : undefined });
    }

    function toggle(entry: BreakdownEntry): void {
        const values = picks[entry.list];
        setPicks(
            entry.list,
            entry.selected
                ? values.filter((value) => value !== entry.value)
                : [...values, entry.value],
        );
    }

    return (
        // biome-ignore lint/a11y/noStaticElementInteractions: Handles Escape from keyboard-operable controls within this activity card.
        <div
            className="@container flex min-w-0 flex-col gap-4"
            onKeyDown={(event) =>
                clearActivitySelectionOnEscape(event, () =>
                    setPeriod({ ...period, bucket: undefined }),
                )
            }
        >
            <header className="flex flex-wrap items-center justify-between gap-3">
                {/* Picks narrow the chart and the table, like the date. */}
                <div className="flex flex-wrap items-center gap-2">
                    <fieldset
                        aria-label="Show usage or earnings"
                        className="flex gap-1"
                    >
                        {TABS.map((option) => (
                            <TabButton
                                key={option.value}
                                active={tab === option.value}
                                onClick={() =>
                                    onChange({
                                        tab:
                                            option.value === "usage"
                                                ? undefined
                                                : option.value,
                                        keys: undefined,
                                        models: undefined,
                                    })
                                }
                            >
                                {option.label}
                            </TabButton>
                        ))}
                    </fieldset>
                    {(["keys", "models"] as const).map(
                        (list) =>
                            picks[list].length > 0 && (
                                <TabButton
                                    key={list}
                                    active
                                    size="xs"
                                    icon={<XIcon />}
                                    ariaLabel={`Clear selected ${PICK_NOUNS[tab][list]}s`}
                                    onClick={() => setPicks(list, [])}
                                >
                                    {picks[list].length} {PICK_NOUNS[tab][list]}
                                    {picks[list].length === 1 ? "" : "s"}
                                </TabButton>
                            ),
                    )}
                </div>
                <ActivityPeriodNavigation
                    label="Overview"
                    value={period}
                    onChange={setPeriod}
                />
            </header>
            <Surface className="flex min-w-0 flex-col gap-4">
                {/* Narrow cards stack Group over Unit with CSV top right;
                    wide ones put Unit next to CSV. */}
                <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-2 @[36rem]:flex-1 @[36rem]:flex-row @[36rem]:items-center @[36rem]:justify-between">
                        {tab === "usage" && (
                            <div className="flex items-center gap-2">
                                <span className={CONTROL_LABEL}>Group</span>
                                <SegmentedControl
                                    ariaLabel="Group"
                                    options={GROUPS}
                                    value={group}
                                    onChange={(next) =>
                                        onChange({
                                            group:
                                                next === "key"
                                                    ? next
                                                    : undefined,
                                        })
                                    }
                                />
                            </div>
                        )}
                        <div className="flex items-center gap-2 @[36rem]:ml-auto">
                            <span className={CONTROL_LABEL}>Unit</span>
                            <SegmentedControl
                                ariaLabel="Unit"
                                options={METRICS}
                                value={metric}
                                onChange={(next) =>
                                    onChange({
                                        metric:
                                            next === "pollen"
                                                ? undefined
                                                : next,
                                    })
                                }
                            />
                        </div>
                    </div>
                    {/* Buttons centre themselves; this keeps CSV at the top,
                        quiet in grey. */}
                    <div data-theme="neutral" className="shrink-0">
                        <CsvDownloadButton
                            disabled={!data.download || data.refreshing}
                            disabledReason={
                                data.loading || data.refreshing
                                    ? `Loading ${tab}`
                                    : `No ${tab} to download for this period`
                            }
                            onClick={() =>
                                data
                                    .download?.()
                                    .catch((error) =>
                                        console.error(
                                            "Activity download failed:",
                                            error,
                                        ),
                                    )
                            }
                        />
                    </div>
                </div>
                <SectionContent loading={data.loading} className="h-[180px]">
                    {data.error && (
                        <LoadError
                            onRetry={data.retry}
                            paths={[ACTIVITY_SOURCES[tab].path]}
                        >
                            {data.error}
                        </LoadError>
                    )}
                    {data.hasData ? (
                        <>
                            <Chart
                                key={`${tab}:${granularity}:${periodName}`}
                                period={period}
                                label={tab === "usage" ? "Usage" : "Earnings"}
                                onSelect={(point) =>
                                    setPeriod(
                                        toggleActivityBucket(
                                            period,
                                            point.timestamp,
                                        ),
                                    )
                                }
                                data={data.chartData}
                                metric={metric}
                            />
                            <BreakdownTable
                                entries={data.entries}
                                totals={data.totals}
                                metric={metric}
                                header={
                                    tab === "earnings"
                                        ? "Source"
                                        : group === "key"
                                          ? "Key"
                                          : "Model"
                                }
                                selecting={data.selecting}
                                icon={
                                    tab === "earnings"
                                        ? (entry) =>
                                              entry.list === "keys" ? (
                                                  <AppIcon aria-label="App" />
                                              ) : (
                                                  <BeakerIcon aria-label="Model" />
                                              )
                                        : undefined
                                }
                                onToggle={toggle}
                            />
                        </>
                    ) : (
                        !data.error && (
                            <ActivityEmptyState>
                                {EMPTY_STATES[tab]}
                            </ActivityEmptyState>
                        )
                    )}
                </SectionContent>
            </Surface>
        </div>
    );
};

const PAGE_SIZE = 15;

// A phone-width card has no room for the Share column.
const SHARE_CELL = "hidden @[32rem]:table-cell";

type BreakdownTableProps = {
    entries: BreakdownEntry[];
    totals: ActivityAmounts;
    metric: Metric;
    /** First column header. */
    header: string;
    /** Rows are selected, so the total covers only those. */
    selecting: boolean;
    icon?: (entry: BreakdownEntry) => ReactNode;
    onToggle: (entry: BreakdownEntry) => void;
};

export const BreakdownTable: FC<BreakdownTableProps> = ({
    entries,
    totals,
    metric,
    header,
    selecting,
    icon,
    onToggle,
}) => {
    // A new list resets paging; picking a row keeps it.
    const ids = entries.map((entry) => entry.id).join("\n");
    const [page, setPage] = useState({ ids, limit: PAGE_SIZE });
    const visibleCount = page.ids === ids ? page.limit : PAGE_SIZE;
    const listed = entries.reduce((sum, entry) => sum + entry[metric], 0);
    return (
        <div className="flex min-w-0 flex-col gap-4">
            <div className="max-w-full overflow-x-auto">
                <Table
                    aria-label="Breakdown"
                    className="[&_tfoot_tr:hover]:bg-transparent [&_thead_tr:hover]:bg-transparent"
                >
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell
                                scope="col"
                                className="px-2 py-1 font-normal"
                            >
                                {header}
                            </TableHeaderCell>
                            <TableHeaderCell
                                scope="col"
                                align="right"
                                className={`${SHARE_CELL} px-2 py-1 font-normal`}
                            >
                                Share
                            </TableHeaderCell>
                            <TableHeaderCell
                                scope="col"
                                align="right"
                                className="px-2 py-1 font-normal"
                            >
                                {metric === "pollen" ? "Pollen" : "Requests"}
                            </TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {entries.slice(0, visibleCount).map((entry) => (
                            <TableRow
                                key={entry.id}
                                onClick={() => onToggle(entry)}
                                className={
                                    entry.selected
                                        ? "cursor-pointer bg-theme-bg-active"
                                        : "cursor-pointer"
                                }
                            >
                                <TableCell className="max-w-64 break-words text-xs">
                                    <button
                                        type="button"
                                        aria-pressed={entry.selected}
                                        className="inline-flex items-center gap-2 text-left [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:shrink-0"
                                    >
                                        {icon?.(entry)}
                                        {entry.label}
                                    </button>
                                </TableCell>
                                <TableCell
                                    align="right"
                                    numeric
                                    className={`${SHARE_CELL} text-xs`}
                                >
                                    {listed > 0
                                        ? (
                                              (entry[metric] / listed) *
                                              100
                                          ).toFixed(1)
                                        : "0.0"}
                                    %
                                </TableCell>
                                <TableCell
                                    align="right"
                                    numeric
                                    className="text-xs"
                                >
                                    <PollenUsageBadges
                                        {...entry}
                                        metric={metric}
                                    />
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                    <tfoot className="border-t border-divider font-semibold">
                        <TableRow>
                            <TableHeaderCell scope="row">
                                {selecting ? "Selected" : "Total"}
                            </TableHeaderCell>
                            <TableCell className={SHARE_CELL} />
                            <TableCell
                                align="right"
                                numeric
                                className="text-xs"
                            >
                                <PollenUsageBadges
                                    {...totals}
                                    metric={metric}
                                />
                            </TableCell>
                        </TableRow>
                    </tfoot>
                </Table>
            </div>
            {visibleCount < entries.length && (
                <div data-theme="neutral" className="flex justify-center">
                    <Button
                        onClick={() =>
                            setPage({ ids, limit: visibleCount + PAGE_SIZE })
                        }
                    >
                        Show more
                    </Button>
                </div>
            )}
        </div>
    );
};
