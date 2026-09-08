import {
    ArrowRightIcon,
    Button,
    CardIcon,
    Chip,
    ClockIcon,
    SproutIcon,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
} from "@pollinations/ui";
import { PaidChip, TierChip } from "@pollinations/ui/wallet";
import { type FC, useEffect, useState } from "react";
import { apiClient } from "../../api.ts";
import { formatActivityPollenThreshold } from "../activity/format-activity-pollen.ts";
import type { EarningsSource } from "../activity/use-earnings-data.ts";

const PAGE_SIZE = 10;
const RECENT_WINDOW_DAYS = 90;
const TABLE_HEADER_CELL_CLASS = "px-2 py-1.5";
const TABLE_CELL_CLASS = "px-2 py-1.5 text-xs";

type UsageEventRecord = {
    timestamp: string;
    cursor_event_id: string;
    model: string | null;
    api_key_id: string | null;
    api_key: string | null;
    meter_source: string | null;
    cost_usd: number;
};

type EarningsEventRecord = {
    source?: EarningsSource;
    timestamp: string;
    cursor_event_id: string;
    entity_name: string;
    model: string | null;
    meter_source: string | null;
    pollen_earned: number;
};

type LastEvent = {
    kind: "usage" | "earnings";
    earningsSource?: EarningsSource;
    id: string;
    timestamp: string;
    primary: string;
    secondary: string;
    meterSource: string | null;
    pollen: number;
};

type FetchState = {
    rows: LastEvent[];
    hasMore: boolean;
    loading: boolean;
    error: string | null;
};

function parseTimestamp(value: string): Date {
    return new Date(`${value.replace(" ", "T")}Z`);
}

function timestampMs(value: string): number {
    return parseTimestamp(value).getTime();
}

function formatTimestamp(value: string): string {
    return parseTimestamp(value).toLocaleString(undefined, {
        timeZone: "UTC",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function formatSignedPollen(event: LastEvent): string {
    if (event.pollen === 0) return "0";
    const sign = event.kind === "earnings" ? "+" : "-";
    return `${sign}${formatActivityPollenThreshold(event.pollen)}`;
}

function EventKindChip({ event }: { event: LastEvent }) {
    const earned = event.kind === "earnings";
    const label = !earned
        ? "Spent"
        : event.earningsSource === "byop_markup"
          ? "App"
          : event.earningsSource === "community_model"
            ? "Model"
            : "Earned";
    return (
        <span className="inline-flex items-center gap-1.5">
            <Chip
                intent={earned ? "neutral" : "danger"}
                size="sm"
                className={`polli:w-5 polli:px-0 ${earned ? "polli:bg-intent-info-bg-light polli:text-intent-info-text" : ""}`}
                aria-hidden="true"
            >
                <ArrowRightIcon
                    className={`h-3 w-3 ${earned ? "rotate-90" : "-rotate-90"}`}
                />
            </Chip>
            {earned && label !== "Earned" && (
                <span className="sr-only">Earned from </span>
            )}
            {label}
        </span>
    );
}

function EventPollenChip({ event }: { event: LastEvent }) {
    const amount = formatSignedPollen(event);
    if (event.meterSource !== "tier" && event.meterSource !== "pack") {
        return (
            <span className="whitespace-nowrap tabular-nums">
                {amount}
                <span className="sr-only"> Pollen</span>
            </span>
        );
    }
    const source = event.meterSource === "tier" ? "Quest" : "Paid";
    const props = {
        size: "sm" as const,
        title: `${source} Pollen`,
        "aria-label": `${amount} ${source} Pollen`,
        className:
            "inline-flex min-w-24 shrink-0 items-center justify-between gap-2 whitespace-nowrap tabular-nums",
    };
    const content = (
        <>
            {event.meterSource === "tier" ? (
                <SproutIcon
                    className="h-3.5 w-3.5 shrink-0"
                    aria-hidden="true"
                />
            ) : (
                <CardIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            )}
            <span>{amount}</span>
        </>
    );
    if (event.meterSource === "tier")
        return <TierChip {...props}>{content}</TierChip>;
    return <PaidChip {...props}>{content}</PaidChip>;
}

function mergeLastEvents(
    usageRows: UsageEventRecord[],
    earningsRows: EarningsEventRecord[],
): LastEvent[] {
    const usageEvents: LastEvent[] = usageRows.map((row) => ({
        kind: "usage",
        id: row.cursor_event_id,
        timestamp: row.timestamp,
        primary: row.model || "API request",
        secondary:
            row.api_key ||
            (row.api_key_id ? `${row.api_key_id.slice(0, 8)}…` : "—"),
        meterSource: row.meter_source,
        pollen: row.cost_usd,
    }));
    const earningsEvents: LastEvent[] = earningsRows.map((row) => ({
        kind: "earnings",
        earningsSource: row.source,
        id: row.cursor_event_id,
        timestamp: row.timestamp,
        primary: row.entity_name,
        secondary: row.model || "—",
        meterSource: row.meter_source,
        pollen: row.pollen_earned,
    }));

    return sortLastEvents([...usageEvents, ...earningsEvents]);
}

function sortLastEvents(events: LastEvent[]): LastEvent[] {
    return [...events].sort((a, b) => {
        const timeDelta = timestampMs(b.timestamp) - timestampMs(a.timestamp);
        if (timeDelta !== 0) return timeDelta;
        return `${a.kind}-${a.id}`.localeCompare(`${b.kind}-${b.id}`);
    });
}

async function fetchLastEvents(
    limit: number,
): Promise<{ rows: LastEvent[]; hasMore: boolean }> {
    const query = {
        limit: (limit + 1).toString(),
        days: RECENT_WINDOW_DAYS.toString(),
    };
    const [usageResponse, earningsResponse] = await Promise.all([
        apiClient.account.usage.$get({ query }),
        apiClient.account.earnings.transactions.$get({ query }),
    ]);
    if (!usageResponse.ok || !earningsResponse.ok) {
        throw new Error("Failed to load last events");
    }
    const usageData = (await usageResponse.json()) as {
        usage: UsageEventRecord[];
    };
    const earningsData = (await earningsResponse.json()) as {
        transactions: EarningsEventRecord[];
    };
    const merged = mergeLastEvents(usageData.usage, earningsData.transactions);
    return { rows: merged.slice(0, limit), hasMore: merged.length > limit };
}

export const LastEventsPanel: FC = () => {
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
    const [state, setState] = useState<FetchState>({
        rows: [],
        hasMore: false,
        loading: true,
        error: null,
    });

    useEffect(() => {
        setState((prev) => ({ ...prev, loading: true, error: null }));
        fetchLastEvents(visibleCount)
            .then(({ rows, hasMore }) =>
                setState({ rows, hasMore, loading: false, error: null }),
            )
            .catch(() =>
                setState((prev) => ({
                    ...prev,
                    loading: false,
                    error: "Failed to load last events",
                })),
            );
    }, [visibleCount]);

    const loadingMore = state.loading && state.rows.length > 0;

    if (state.loading && state.rows.length === 0) {
        return (
            <p className="text-sm text-theme-text-muted animate-[pulse_2s_ease-in-out_infinite]">
                Loading…
            </p>
        );
    }

    if (state.error && state.rows.length === 0) {
        return <p className="text-sm text-intent-danger-text">{state.error}</p>;
    }

    if (state.rows.length === 0) {
        return (
            <p className="text-sm text-ink-600">
                No events yet. API usage and earnings will appear here.
            </p>
        );
    }

    return (
        <div className="flex flex-col gap-3">
            {state.error && (
                <p className="text-sm text-intent-danger-text">{state.error}</p>
            )}
            <div className="flex flex-col gap-3">
                <ul className="flex flex-col gap-2 sm:hidden">
                    {state.rows.map((event) => (
                        <li
                            key={`${event.kind}-${event.id}`}
                            className="flex flex-col gap-1.5 rounded-lg bg-surface-opaque p-3"
                        >
                            <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold text-ink-900 truncate">
                                    {event.primary}
                                </span>
                                <EventPollenChip event={event} />
                            </div>
                            <div className="flex items-center justify-between gap-2 text-xs">
                                <span className="text-ink-600 tabular-nums">
                                    {formatTimestamp(event.timestamp)}
                                </span>
                                <EventKindChip event={event} />
                            </div>
                            <div className="flex items-center justify-between gap-2 text-xs">
                                <span className="text-ink-500 truncate">
                                    {event.secondary}
                                </span>
                            </div>
                        </li>
                    ))}
                </ul>

                <div className="hidden overflow-x-auto sm:block">
                    <Table
                        aria-label="Last events"
                        className="text-left text-xs"
                    >
                        <TableHead className="sr-only">
                            <TableRow className="hover:bg-transparent">
                                <TableHeaderCell
                                    className={TABLE_HEADER_CELL_CLASS}
                                >
                                    Time
                                </TableHeaderCell>
                                <TableHeaderCell
                                    className={TABLE_HEADER_CELL_CLASS}
                                >
                                    Type
                                </TableHeaderCell>
                                <TableHeaderCell
                                    className={TABLE_HEADER_CELL_CLASS}
                                >
                                    Details
                                </TableHeaderCell>
                                <TableHeaderCell
                                    align="right"
                                    className={TABLE_HEADER_CELL_CLASS}
                                >
                                    Pollen
                                </TableHeaderCell>
                            </TableRow>
                        </TableHead>
                        <TableBody divider="neutral">
                            {state.rows.map((event) => (
                                <TableRow key={`${event.kind}-${event.id}`}>
                                    <TableCell
                                        numeric
                                        className={`${TABLE_CELL_CLASS} whitespace-nowrap text-ink-800`}
                                    >
                                        {formatTimestamp(event.timestamp)}
                                    </TableCell>
                                    <TableCell className={TABLE_CELL_CLASS}>
                                        <EventKindChip event={event} />
                                    </TableCell>
                                    <TableCell
                                        className={`${TABLE_CELL_CLASS} text-ink-900`}
                                    >
                                        <div className="flex min-w-0 flex-col">
                                            <span className="truncate font-medium">
                                                {event.primary}
                                            </span>
                                            <span className="truncate text-ink-500">
                                                {event.secondary}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell
                                        align="right"
                                        numeric
                                        className={TABLE_CELL_CLASS}
                                    >
                                        <EventPollenChip event={event} />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>

                <div className="mt-4 flex flex-col gap-3 border-t border-divider pt-4 text-[13px] leading-snug text-theme-text-muted sm:flex-row sm:items-center sm:justify-between">
                    <p className="flex items-start gap-1.5">
                        <ClockIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>
                            Showing {state.rows.length} recent event
                            {state.rows.length === 1 ? "" : "s"}.
                        </span>
                    </p>
                    {state.hasMore && (
                        <Button
                            as="button"
                            onClick={() =>
                                setVisibleCount((count) => count + PAGE_SIZE)
                            }
                            disabled={state.loading}
                            className="self-start sm:self-auto"
                        >
                            {loadingMore ? "Loading…" : "Load more"}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
};
