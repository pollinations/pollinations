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
import { type FC, useEffect, useState } from "react";
import { apiClient } from "../../api.ts";
import { formatActivityPollenThreshold } from "../activity/format-activity-pollen.ts";

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
    timestamp: string;
    cursor_event_id: string;
    entity_name: string;
    model: string | null;
    meter_source: string | null;
    pollen_earned: number;
};

type LastEvent = {
    kind: "usage" | "earnings";
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
            Used
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
                                    align="center"
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
                                    align="center"
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
                            {state.rows.map((event) => (
                                <TableRow key={`${event.kind}-${event.id}`}>
                                    <TableCell
                                        numeric
                                        className={`${TABLE_CELL_CLASS} whitespace-nowrap text-ink-800`}
                                    >
                                        {formatTimestamp(event.timestamp)}
                                    </TableCell>
                                    <TableCell
                                        align="center"
                                        className={TABLE_CELL_CLASS}
                                    >
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
                                    <TableCell
                                        align="center"
                                        className={TABLE_CELL_CLASS}
                                    >
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
