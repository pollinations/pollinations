import {
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
import { type FC, useEffect, useMemo, useRef, useState } from "react";
import { apiClient } from "../../api.ts";
import { formatActivityPollenThreshold } from "../activity/format-activity-pollen.ts";
import {
    getMockEarningsEventRows,
    getMockUsageEventRows,
    isActivityMockEnabled,
} from "../activity/mock-activity-data.ts";
import type { ApiKey } from "../keys";

const PAGE_SIZE = 10;
const FETCH_LIMIT = PAGE_SIZE + 1;
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
    timestamp: string;
    cursor_event_id: string;
    app_key_id: string;
    app_name: string;
    model: string | null;
    meter_source: string | null;
    pollen_earned: number;
};

type LastEvent =
    | {
          kind: "usage";
          id: string;
          timestamp: string;
          primary: string;
          secondary: string;
          meterSource: string | null;
          pollen: number;
      }
    | {
          kind: "earnings";
          id: string;
          timestamp: string;
          primary: string;
          secondary: string;
          meterSource: string | null;
          pollen: number;
      };

type EventCursor = {
    timestamp: string;
    eventId: string;
};

type EventStreamState = {
    nextCursor: EventCursor | null;
    hasMore: boolean;
};

type FetchState = {
    rows: LastEvent[];
    visibleCount: number;
    loading: boolean;
    loadingMore: boolean;
    error: string | null;
    usage: EventStreamState;
    earnings: EventStreamState;
};

const INITIAL_STREAM_STATE: EventStreamState = {
    nextCursor: null,
    hasMore: true,
};

const INITIAL_STATE: FetchState = {
    rows: [],
    visibleCount: PAGE_SIZE,
    loading: true,
    loadingMore: false,
    error: null,
    usage: INITIAL_STREAM_STATE,
    earnings: INITIAL_STREAM_STATE,
};

function parseTimestamp(value: string): Date {
    const normalizedUtcTimestamp = value.match(
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
    )
        ? `${value.replace(" ", "T")}Z`
        : value;
    return new Date(normalizedUtcTimestamp);
}

function timestampMs(value: string): number {
    const date = parseTimestamp(value);
    const ms = date.getTime();
    return Number.isNaN(ms) ? 0 : ms;
}

function formatTimestamp(value: string): string {
    const date = parseTimestamp(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString(undefined, {
        timeZone: "UTC",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function formatSignedPollen(event: LastEvent): string {
    const sign = event.kind === "earnings" ? "+" : "-";
    return `${sign}${formatActivityPollenThreshold(event.pollen)}`;
}

function EventKindChip({ kind }: { kind: LastEvent["kind"] }) {
    if (kind === "earnings") {
        return (
            <Chip intent="alpha" size="sm">
                Earned
            </Chip>
        );
    }
    return (
        <Chip intent="danger" size="sm">
            Spent
        </Chip>
    );
}

function MeterSourceChip({ source }: { source: string | null }) {
    if (source === "tier") {
        return (
            <TierChip
                size="sm"
                aria-label="quest"
                title="quest"
                className="justify-center"
            >
                <SproutIcon className="h-3.5 w-3.5" aria-hidden="true" />
            </TierChip>
        );
    }
    if (source === "pack") {
        return (
            <PaidChip
                size="sm"
                aria-label="paid"
                title="paid"
                className="justify-center"
            >
                <CardIcon className="h-3.5 w-3.5" aria-hidden="true" />
            </PaidChip>
        );
    }
    return (
        <Chip intent="neutral" size="sm">
            unknown
        </Chip>
    );
}

function buildKeyNameLookup(keys: ApiKey[]) {
    const map = new Map<string, string>();
    for (const key of keys) {
        if (key.name) map.set(key.id, key.name);
    }
    return (id: string | null, fallbackName?: string | null) => {
        if (!id) return fallbackName ?? "—";
        return map.get(id) ?? fallbackName ?? `${id.slice(0, 8)}…`;
    };
}

function mergeLastEvents(
    usageRows: UsageEventRecord[],
    earningsRows: EarningsEventRecord[],
    lookupKeyName: (id: string | null, fallbackName?: string | null) => string,
): LastEvent[] {
    const usageEvents: LastEvent[] = usageRows.map((row) => ({
        kind: "usage",
        id: row.cursor_event_id || `usage-${row.timestamp}-${row.cost_usd}`,
        timestamp: row.timestamp,
        primary: row.model || "API request",
        secondary: lookupKeyName(row.api_key_id, row.api_key),
        meterSource: row.meter_source,
        pollen: row.cost_usd,
    }));
    const earningsEvents: LastEvent[] = earningsRows.map((row) => ({
        kind: "earnings",
        id:
            row.cursor_event_id ||
            `earnings-${row.timestamp}-${row.app_key_id}-${row.pollen_earned}`,
        timestamp: row.timestamp,
        primary: row.app_name || row.app_key_id || "App earnings",
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

function dedupeAndSortLastEvents(events: LastEvent[]): LastEvent[] {
    const byKey = new Map<string, LastEvent>();
    for (const event of events) {
        byKey.set(`${event.kind}:${event.id}`, event);
    }
    return sortLastEvents(Array.from(byKey.values()));
}

function eventCursorFromRecord(
    row: UsageEventRecord | EarningsEventRecord,
): EventCursor {
    return {
        timestamp: row.timestamp,
        eventId: row.cursor_event_id,
    };
}

function eventPageQuery(cursor: EventCursor | null) {
    const query: {
        limit: string;
        days: string;
        before?: string;
        before_event_id?: string;
    } = {
        limit: FETCH_LIMIT.toString(),
        days: RECENT_WINDOW_DAYS.toString(),
    };
    if (cursor) {
        query.before = cursor.timestamp;
        query.before_event_id = cursor.eventId;
    }
    return query;
}

type StreamPage<T> = {
    rows: T[];
    nextCursor: EventCursor | null;
    hasMore: boolean;
};

function pageFromRows<T extends UsageEventRecord | EarningsEventRecord>(
    fetchedRows: T[],
): StreamPage<T> {
    const rows = fetchedRows.slice(0, PAGE_SIZE);
    const hasMore = fetchedRows.length > PAGE_SIZE;
    const last = rows[rows.length - 1];
    return {
        rows,
        hasMore,
        nextCursor: hasMore && last ? eventCursorFromRecord(last) : null,
    };
}

async function fetchUsageEventsPage(
    cursor: EventCursor | null,
): Promise<StreamPage<UsageEventRecord>> {
    if (isActivityMockEnabled()) {
        return pageFromRows(getMockUsageEventRows(cursor, FETCH_LIMIT));
    }

    const response = await apiClient.account.usage.$get({
        query: eventPageQuery(cursor),
    });
    if (!response.ok) throw new Error("Failed to load last events");
    const data = (await response.json()) as { usage: UsageEventRecord[] };
    return pageFromRows(data.usage ?? []);
}

async function fetchEarningsEventsPage(
    cursor: EventCursor | null,
): Promise<StreamPage<EarningsEventRecord>> {
    if (isActivityMockEnabled()) {
        return pageFromRows(getMockEarningsEventRows(cursor, FETCH_LIMIT));
    }

    const response = await apiClient.account.earnings.transactions.$get({
        query: eventPageQuery(cursor),
    });
    if (!response.ok) throw new Error("Failed to load last events");
    const data = (await response.json()) as {
        transactions: EarningsEventRecord[];
    };
    return pageFromRows(data.transactions ?? []);
}

export const LastEventsPanel: FC<{ apiKeys: ApiKey[] }> = ({ apiKeys }) => {
    const [state, setState] = useState<FetchState>(INITIAL_STATE);
    const lookupKeyName = useMemo(() => buildKeyNameLookup(apiKeys), [apiKeys]);
    const requestSeqRef = useRef(0);

    useEffect(() => {
        const requestId = requestSeqRef.current + 1;
        requestSeqRef.current = requestId;
        const isCurrentRequest = () => requestSeqRef.current === requestId;

        async function loadEvents(): Promise<void> {
            setState({ ...INITIAL_STATE, loading: true, error: null });

            const [usagePage, earningsPage] = await Promise.all([
                fetchUsageEventsPage(null),
                fetchEarningsEventsPage(null),
            ]);

            if (!isCurrentRequest()) return;

            setState({
                rows: mergeLastEvents(
                    usagePage.rows,
                    earningsPage.rows,
                    lookupKeyName,
                ),
                visibleCount: PAGE_SIZE,
                loading: false,
                loadingMore: false,
                error: null,
                usage: {
                    nextCursor: usagePage.nextCursor,
                    hasMore: usagePage.hasMore,
                },
                earnings: {
                    nextCursor: earningsPage.nextCursor,
                    hasMore: earningsPage.hasMore,
                },
            });
        }

        loadEvents().catch(() => {
            if (!isCurrentRequest()) return;
            setState({
                rows: [],
                visibleCount: PAGE_SIZE,
                loading: false,
                loadingMore: false,
                error: "Failed to load last events",
                usage: INITIAL_STREAM_STATE,
                earnings: INITIAL_STREAM_STATE,
            });
        });

        return () => {
            requestSeqRef.current += 1;
        };
    }, [lookupKeyName]);

    async function handleLoadMore(): Promise<void> {
        if (state.loading || state.loadingMore) return;

        const nextVisibleCount = state.visibleCount + PAGE_SIZE;
        const hasStreamMore = state.usage.hasMore || state.earnings.hasMore;

        if (!hasStreamMore) {
            setState((prev) => ({
                ...prev,
                visibleCount: nextVisibleCount,
            }));
            return;
        }

        const requestId = requestSeqRef.current + 1;
        requestSeqRef.current = requestId;
        const isCurrentRequest = () => requestSeqRef.current === requestId;
        const usageSnapshot = state.usage;
        const earningsSnapshot = state.earnings;

        setState((prev) => ({
            ...prev,
            loadingMore: true,
            error: null,
        }));

        try {
            const [usagePage, earningsPage] = await Promise.all([
                usageSnapshot.hasMore
                    ? fetchUsageEventsPage(usageSnapshot.nextCursor)
                    : Promise.resolve({
                          rows: [],
                          nextCursor: null,
                          hasMore: false,
                      }),
                earningsSnapshot.hasMore
                    ? fetchEarningsEventsPage(earningsSnapshot.nextCursor)
                    : Promise.resolve({
                          rows: [],
                          nextCursor: null,
                          hasMore: false,
                      }),
            ]);

            if (!isCurrentRequest()) return;

            const newEvents = mergeLastEvents(
                usagePage.rows,
                earningsPage.rows,
                lookupKeyName,
            );
            setState((prev) => ({
                ...prev,
                rows: dedupeAndSortLastEvents([...prev.rows, ...newEvents]),
                visibleCount: nextVisibleCount,
                loadingMore: false,
                error: null,
                usage: usageSnapshot.hasMore
                    ? {
                          nextCursor: usagePage.nextCursor,
                          hasMore: usagePage.hasMore,
                      }
                    : prev.usage,
                earnings: earningsSnapshot.hasMore
                    ? {
                          nextCursor: earningsPage.nextCursor,
                          hasMore: earningsPage.hasMore,
                      }
                    : prev.earnings,
            }));
        } catch {
            if (!isCurrentRequest()) return;
            setState((prev) => ({
                ...prev,
                loadingMore: false,
                error: "Failed to load last events",
            }));
        }
    }

    const visibleRows = state.rows.slice(0, state.visibleCount);
    const canLoadMore =
        state.rows.length > visibleRows.length ||
        state.usage.hasMore ||
        state.earnings.hasMore;

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
                No events yet. API usage and app earnings will appear here.
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
                    {visibleRows.map((event) => (
                        <li
                            key={`${event.kind}-${event.id}`}
                            className="flex flex-col gap-1.5 rounded-lg bg-surface-opaque p-3"
                        >
                            <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold text-ink-900 truncate">
                                    {event.primary}
                                </span>
                                <span
                                    className={`tabular-nums font-semibold shrink-0 ${
                                        event.kind === "earnings"
                                            ? "text-intent-success-text"
                                            : "text-intent-danger-text"
                                    }`}
                                >
                                    {formatSignedPollen(event)}
                                </span>
                            </div>
                            <div className="flex items-center justify-between gap-2 text-xs">
                                <span className="text-ink-600 tabular-nums">
                                    {formatTimestamp(event.timestamp)}
                                </span>
                                <EventKindChip kind={event.kind} />
                            </div>
                            <div className="flex items-center justify-between gap-2 text-xs">
                                <span className="text-ink-500 truncate">
                                    {event.secondary}
                                </span>
                                <MeterSourceChip source={event.meterSource} />
                            </div>
                        </li>
                    ))}
                </ul>

                <div className="hidden overflow-x-auto sm:block">
                    <Table className="text-left text-xs">
                        <TableHead>
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
                                    className={TABLE_HEADER_CELL_CLASS}
                                >
                                    Source
                                </TableHeaderCell>
                                <TableHeaderCell
                                    align="right"
                                    className={TABLE_HEADER_CELL_CLASS}
                                >
                                    Pollen
                                </TableHeaderCell>
                            </TableRow>
                        </TableHead>
                        <TableBody className="divide-divider/70">
                            {visibleRows.map((event) => (
                                <TableRow key={`${event.kind}-${event.id}`}>
                                    <TableCell
                                        numeric
                                        className={`${TABLE_CELL_CLASS} whitespace-nowrap text-ink-800`}
                                    >
                                        {formatTimestamp(event.timestamp)}
                                    </TableCell>
                                    <TableCell className={TABLE_CELL_CLASS}>
                                        <EventKindChip kind={event.kind} />
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
                                    <TableCell className={TABLE_CELL_CLASS}>
                                        <MeterSourceChip
                                            source={event.meterSource}
                                        />
                                    </TableCell>
                                    <TableCell
                                        align="right"
                                        numeric
                                        className={`${TABLE_CELL_CLASS} font-semibold ${
                                            event.kind === "earnings"
                                                ? "text-intent-success-text"
                                                : "text-intent-danger-text"
                                        }`}
                                    >
                                        {formatSignedPollen(event)}
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
                            Showing {visibleRows.length} recent event
                            {visibleRows.length === 1 ? "" : "s"}.
                        </span>
                    </p>
                    {canLoadMore && (
                        <Button
                            as="button"
                            onClick={handleLoadMore}
                            disabled={state.loadingMore}
                            className="self-start sm:self-auto"
                        >
                            {state.loadingMore ? "Loading…" : "Load more"}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
};
