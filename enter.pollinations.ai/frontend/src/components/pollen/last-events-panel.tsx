import {
    ArrowRightIcon,
    Button,
    CardIcon,
    Chip,
    SproutIcon,
    StableLabel,
    Surface,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
} from "@pollinations/ui";
import { PaidChip, TierChip } from "@pollinations/ui/wallet";
import { type FC, useCallback, useEffect, useRef, useState } from "react";
import { accountClient } from "../../api.ts";
import { formatActivityPollenThreshold } from "../activity/format-activity-pollen.ts";
import { CardLoading, LoadError } from "../layout/dashboard-loading.tsx";

const PAGE_SIZE = 15;
const RECENT_WINDOW_DAYS = 90;
const TABLE_HEADER_CELL_CLASS = "px-2 py-1 font-normal";
// Columns a narrow card leaves out.
const WIDE_CELL = "hidden @[32rem]:table-cell";
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
    cursor_source: string;
    cursor_entity_id: string;
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
    cursor: {
        before: string;
        before_event_id: string;
        before_source?: string;
        before_entity_id?: string;
    };
};

type EventPage = {
    rows: LastEvent[];
    cursor?: LastEvent["cursor"];
    hasMore: boolean;
};

type FeedPages = Record<LastEvent["kind"], EventPage>;

type FetchState = {
    rows: LastEvent[];
    hasMore: boolean;
    loading: boolean;
    error: string | null;
};

function parseTimestamp(value: string): Date {
    return new Date(`${value.replace(" ", "T")}Z`);
}

/** No year: the list only reaches back 90 days. */
function formatTimestamp(value: string): string {
    return parseTimestamp(value).toLocaleString(undefined, {
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
    const label = earned ? "Earned" : "Spent";
    return (
        <span className="inline-flex" title={label}>
            <Chip
                intent={earned ? "info" : "danger"}
                size="icon"
                aria-hidden="true"
            >
                <ArrowRightIcon
                    className={`h-3 w-3 ${earned ? "rotate-90" : "-rotate-90"}`}
                />
            </Chip>
            <span className="sr-only">{label}</span>
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
        // Same-width chips with left-aligned digits, as in the Overview table;
        // 6rem fits the widest value, "-<0.0001".
        className:
            "inline-flex w-24 shrink-0 items-center justify-start gap-2 whitespace-nowrap tabular-nums",
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

function usageEvents(rows: UsageEventRecord[]): LastEvent[] {
    return rows.map((row) => ({
        kind: "usage",
        id: row.cursor_event_id,
        timestamp: row.timestamp,
        primary: row.model || "API request",
        secondary:
            row.api_key ||
            (row.api_key_id ? `${row.api_key_id.slice(0, 8)}…` : "—"),
        meterSource: row.meter_source,
        pollen: row.cost_usd,
        cursor: { before: row.timestamp, before_event_id: row.cursor_event_id },
    }));
}

function earningsEvents(rows: EarningsEventRecord[]): LastEvent[] {
    return rows.map((row) => ({
        kind: "earnings",
        id: JSON.stringify([
            row.cursor_event_id,
            row.cursor_source,
            row.cursor_entity_id,
        ]),
        timestamp: row.timestamp,
        primary: row.entity_name,
        secondary: row.model || "—",
        meterSource: row.meter_source,
        pollen: row.pollen_earned,
        cursor: {
            before: row.timestamp,
            before_event_id: row.cursor_event_id,
            before_source: row.cursor_source,
            before_entity_id: row.cursor_entity_id,
        },
    }));
}

const LAST_EVENTS_PATHS = ["/account/usage", "/account/earnings/transactions"];

async function fillEventPage(
    kind: LastEvent["kind"],
    page: EventPage,
    signal: AbortSignal,
): Promise<EventPage> {
    if (page.rows.length > PAGE_SIZE || !page.hasMore) return page;
    const query = {
        limit: (PAGE_SIZE + 1).toString(),
        days: RECENT_WINDOW_DAYS.toString(),
        ...page.cursor,
    };
    const response = await (kind === "usage"
        ? accountClient.usage.$get({ query }, { init: { signal } })
        : accountClient.earnings.transactions.$get(
              { query },
              { init: { signal } },
          ));
    if (!response.ok) {
        throw new Error("Couldn’t load recent activity. Please try again.");
    }
    const data = await response.json();
    const rows =
        kind === "usage"
            ? usageEvents((data as { usage: UsageEventRecord[] }).usage)
            : earningsEvents(
                  (data as { transactions: EarningsEventRecord[] })
                      .transactions,
              );
    return {
        rows: [...page.rows, ...rows],
        cursor: rows.at(-1)?.cursor ?? page.cursor,
        hasMore: rows.length === PAGE_SIZE + 1,
    };
}

async function fetchLastEvents(pages: FeedPages, signal: AbortSignal) {
    const [usage, earnings] = await Promise.all([
        fillEventPage("usage", pages.usage, signal),
        fillEventPage("earnings", pages.earnings, signal),
    ]);
    const next = {
        usage: { ...usage, rows: [...usage.rows] },
        earnings: { ...earnings, rows: [...earnings.rows] },
    };
    const rows: LastEvent[] = [];
    // Keep each pipe's ordering, including every same-second reward identity.
    while (rows.length < PAGE_SIZE) {
        const spent = next.usage.rows[0];
        const earned = next.earnings.rows[0];
        if (!spent && !earned) break;
        const page =
            !spent || (earned && earned.timestamp >= spent.timestamp)
                ? next.earnings
                : next.usage;
        const event = page.rows.shift();
        if (event) rows.push(event);
    }
    return {
        pages: next,
        rows,
        hasMore: next.usage.rows.length + next.earnings.rows.length > 0,
    };
}

export const LastEventsPanel: FC = () => {
    const pages = useRef<FeedPages>({
        usage: { rows: [], hasMore: true },
        earnings: { rows: [], hasMore: true },
    });
    const request = useRef<AbortController | null>(null);
    const [state, setState] = useState<FetchState>({
        rows: [],
        hasMore: false,
        loading: true,
        error: null,
    });

    const load = useCallback(async () => {
        request.current?.abort();
        const controller = new AbortController();
        request.current = controller;
        setState((prev) => ({ ...prev, loading: true, error: null }));
        try {
            const result = await fetchLastEvents(
                pages.current,
                controller.signal,
            );
            if (controller.signal.aborted) return;
            pages.current = result.pages;
            setState((prev) => ({
                rows: [...prev.rows, ...result.rows],
                hasMore: result.hasMore,
                loading: false,
                error: null,
            }));
        } catch (error) {
            if (controller.signal.aborted) return;
            setState((prev) => ({
                ...prev,
                loading: false,
                error:
                    error instanceof Error
                        ? error.message
                        : "Couldn’t load recent activity. Please try again.",
            }));
        }
    }, []);

    useEffect(() => {
        load();
        return () => request.current?.abort();
    }, [load]);

    const loadingMore = state.loading && state.rows.length > 0;

    if (state.loading && state.rows.length === 0) {
        return <CardLoading className="h-64" />;
    }

    if (state.error && state.rows.length === 0) {
        return (
            <LoadError onRetry={load} paths={LAST_EVENTS_PATHS}>
                {state.error}
            </LoadError>
        );
    }

    if (state.rows.length === 0) {
        return (
            <Surface>
                <p className="text-sm text-ink-600">
                    No events yet. API usage and earnings will appear here.
                </p>
            </Surface>
        );
    }

    const showOlder = state.hasMore && (
        <div data-theme="neutral" className="mt-4 flex justify-center">
            <Button as="button" onClick={load} disabled={state.loading}>
                <StableLabel
                    text={loadingMore ? "Loading…" : "Show older"}
                    options={["Show older", "Loading…"]}
                />
            </Button>
        </div>
    );

    return (
        <div className="flex flex-col gap-3">
            {state.error && (
                <LoadError onRetry={load} paths={LAST_EVENTS_PATHS}>
                    {state.error}
                </LoadError>
            )}
            {/* One table at every width, like the Overview table; narrow
                cards fold Time into Details. */}
            <Surface className="@container max-w-full overflow-x-auto">
                <Table aria-label="Last events" className="text-left text-xs">
                    <TableHead>
                        <TableRow className="hover:bg-transparent">
                            <TableHeaderCell
                                scope="col"
                                className={`${WIDE_CELL} ${TABLE_HEADER_CELL_CLASS}`}
                            >
                                Time
                            </TableHeaderCell>
                            <TableHeaderCell
                                scope="col"
                                className={TABLE_HEADER_CELL_CLASS}
                            >
                                <span className="sr-only">Type</span>
                            </TableHeaderCell>
                            <TableHeaderCell
                                scope="col"
                                className={TABLE_HEADER_CELL_CLASS}
                            >
                                Details
                            </TableHeaderCell>
                            <TableHeaderCell
                                scope="col"
                                align="right"
                                className={TABLE_HEADER_CELL_CLASS}
                            >
                                Pollen
                            </TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {state.rows.map((event) => (
                            <TableRow key={`${event.kind}-${event.id}`}>
                                <TableCell
                                    numeric
                                    className={`${WIDE_CELL} ${TABLE_CELL_CLASS} whitespace-nowrap text-ink-800`}
                                >
                                    {formatTimestamp(event.timestamp)}
                                </TableCell>
                                <TableCell className={TABLE_CELL_CLASS}>
                                    <EventKindChip event={event} />
                                </TableCell>
                                <TableCell
                                    className={`${TABLE_CELL_CLASS} w-full max-w-0 text-ink-900`}
                                >
                                    <div className="flex min-w-0 flex-col">
                                        <span className="truncate font-medium">
                                            {event.primary}
                                        </span>
                                        <span className="truncate text-ink-500">
                                            <span className="tabular-nums @[32rem]:hidden">
                                                {formatTimestamp(
                                                    event.timestamp,
                                                )}
                                                {event.secondary && " · "}
                                            </span>
                                            {event.secondary}
                                        </span>
                                    </div>
                                </TableCell>
                                <TableCell
                                    numeric
                                    align="right"
                                    className={TABLE_CELL_CLASS}
                                >
                                    <EventPollenChip event={event} />
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
                {showOlder}
            </Surface>
        </div>
    );
};
