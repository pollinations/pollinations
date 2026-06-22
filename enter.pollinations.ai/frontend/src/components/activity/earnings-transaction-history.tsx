import {
    Button,
    InlineLink,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
} from "@pollinations/ui";
import { PaidChip, TierChip } from "@pollinations/ui/wallet";
import { type FC, useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "../../api.ts";
import { formatActivityPollenThreshold } from "./format-activity-pollen.ts";
import type { UsagePeriodSelection } from "./types.ts";

const PAGE_SIZE = 10;
const FETCH_LIMIT = PAGE_SIZE + 1;
const EMPTY_FILTER_VALUES: string[] = [];
const TABLE_HEADER_CELL_CLASS = "px-2 py-1.5";
const TABLE_CELL_CLASS = "px-2 py-1.5 text-xs";

type EarningsTransaction = {
    timestamp: string;
    cursor_event_id: string;
    app_key_id: string;
    app_name: string;
    model: string | null;
    meter_source: string | null;
    pollen_earned: number;
};

type EarningsCursor = {
    timestamp: string;
    eventId: string;
};

type FetchState = {
    rows: EarningsTransaction[];
    loading: boolean;
    error: string | null;
    nextCursor: EarningsCursor | null;
    hasMore: boolean;
};

const INITIAL_STATE: FetchState = {
    rows: [],
    loading: true,
    error: null,
    nextCursor: null,
    hasMore: true,
};

function parseTimestamp(value: string): Date {
    const normalizedUtcTimestamp = value.match(
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
    )
        ? `${value.replace(" ", "T")}Z`
        : value;
    return new Date(normalizedUtcTimestamp);
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

function formatCost(value: number): string {
    return formatActivityPollenThreshold(value);
}

function MeterSourceChip({ source }: { source: string | null }) {
    if (source === "tier") return <TierChip>tier</TierChip>;
    return <PaidChip>paid</PaidChip>;
}

function rowKey(row: EarningsTransaction, index: number): string {
    if (row.cursor_event_id) return row.cursor_event_id;
    return `${row.timestamp}-${row.app_key_id}-${row.model || "model"}-${
        row.pollen_earned
    }-${index}`;
}

export type EarningsTransactionHistoryProps = {
    period?: UsagePeriodSelection;
    selectedAppKeyIds?: string[];
};

export const EarningsTransactionHistory: FC<
    EarningsTransactionHistoryProps
> = ({ period, selectedAppKeyIds = EMPTY_FILTER_VALUES }) => {
    const [state, setState] = useState<FetchState>(INITIAL_STATE);
    const requestSeqRef = useRef(0);

    const loadPage = useCallback(
        async (cursor: EarningsCursor | null): Promise<void> => {
            const requestId = requestSeqRef.current + 1;
            requestSeqRef.current = requestId;
            const isCurrentRequest = () => requestSeqRef.current === requestId;
            setState((prev) => ({ ...prev, loading: true, error: null }));
            const query: {
                limit: string;
                before?: string;
                before_event_id?: string;
                granularity?: string;
                period?: string;
                api_key_ids?: string;
            } = {
                limit: FETCH_LIMIT.toString(),
            };
            if (period) {
                query.granularity = period.granularity;
                query.period = period.period;
            }
            if (selectedAppKeyIds.length > 0) {
                query.api_key_ids = selectedAppKeyIds.join(",");
            }
            if (cursor) {
                query.before = cursor.timestamp;
                query.before_event_id = cursor.eventId;
            }

            try {
                const response =
                    await apiClient.account.earnings.transactions.$get({
                        query,
                    });
                if (!isCurrentRequest()) return;
                if (!response.ok) {
                    setState((prev) => ({
                        ...prev,
                        loading: false,
                        error: `Failed to load earnings (${response.status})`,
                    }));
                    return;
                }

                const data = (await response.json()) as {
                    transactions: EarningsTransaction[];
                };
                if (!isCurrentRequest()) return;
                const fetchedRows = data.transactions ?? [];
                const rows = fetchedRows.slice(0, PAGE_SIZE);
                const hasMore = fetchedRows.length > PAGE_SIZE;
                const last = rows[rows.length - 1];
                const nextCursor =
                    hasMore && last
                        ? {
                              timestamp: last.timestamp,
                              eventId: last.cursor_event_id,
                          }
                        : null;

                setState((prev) => ({
                    rows: cursor ? [...prev.rows, ...rows] : rows,
                    loading: false,
                    error: null,
                    nextCursor,
                    hasMore,
                }));
            } catch (error) {
                if (!isCurrentRequest()) return;
                setState((prev) => ({
                    ...prev,
                    loading: false,
                    error:
                        error instanceof Error
                            ? error.message
                            : "Failed to load earnings",
                }));
            }
        },
        [period, selectedAppKeyIds],
    );

    useEffect(() => {
        loadPage(null);
        return () => {
            requestSeqRef.current += 1;
        };
    }, [loadPage]);

    function handleLoadMore(): void {
        if (state.loading || !state.hasMore || !state.nextCursor) return;
        loadPage(state.nextCursor);
    }

    const showEmpty = state.rows.length === 0 && !state.loading && !state.error;
    return (
        <div className="flex flex-col gap-3">
            {state.error && (
                <p className="text-sm text-intent-danger-500">{state.error}</p>
            )}

            {state.loading && state.rows.length === 0 && (
                <p className="text-sm text-ink-600">Loading…</p>
            )}

            {showEmpty && (
                <p className="text-sm text-ink-600">
                    No earnings in this selected period. Once users start
                    spending pollen through your app, earnings will appear here.{" "}
                    <InlineLink href="#keys" showIcon={false}>
                        Create an App key
                    </InlineLink>
                    .
                </p>
            )}

            {state.rows.length > 0 && (
                <>
                    <ul className="flex flex-col gap-2 sm:hidden">
                        {state.rows.map((row, index) => (
                            <li
                                key={rowKey(row, index)}
                                className="flex flex-col gap-1.5 rounded-lg bg-surface-opaque p-3"
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <span className="font-semibold text-ink-900 truncate">
                                        {row.app_name || row.app_key_id || "—"}
                                    </span>
                                    <span className="tabular-nums font-semibold text-ink-900 shrink-0">
                                        {formatCost(row.pollen_earned)}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between gap-2 text-xs">
                                    <span className="text-ink-600 tabular-nums">
                                        {formatTimestamp(row.timestamp)}
                                    </span>
                                    <MeterSourceChip
                                        source={row.meter_source}
                                    />
                                </div>
                                <div className="text-xs text-ink-500 truncate">
                                    {row.model || "—"}
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
                                        App
                                    </TableHeaderCell>
                                    <TableHeaderCell
                                        className={TABLE_HEADER_CELL_CLASS}
                                    >
                                        Model
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
                                        Earned
                                    </TableHeaderCell>
                                </TableRow>
                            </TableHead>
                            <TableBody className="divide-divider/70">
                                {state.rows.map((row, index) => (
                                    <TableRow key={rowKey(row, index)}>
                                        <TableCell
                                            numeric
                                            className={`${TABLE_CELL_CLASS} whitespace-nowrap text-ink-800`}
                                        >
                                            {formatTimestamp(row.timestamp)}
                                        </TableCell>
                                        <TableCell
                                            className={`${TABLE_CELL_CLASS} max-w-[12rem] truncate text-ink-900`}
                                        >
                                            {row.app_name ||
                                                row.app_key_id ||
                                                "—"}
                                        </TableCell>
                                        <TableCell
                                            className={`${TABLE_CELL_CLASS} text-ink-700`}
                                        >
                                            {row.model || "—"}
                                        </TableCell>
                                        <TableCell className={TABLE_CELL_CLASS}>
                                            <MeterSourceChip
                                                source={row.meter_source}
                                            />
                                        </TableCell>
                                        <TableCell
                                            align="right"
                                            numeric
                                            className={`${TABLE_CELL_CLASS} font-medium text-ink-900`}
                                        >
                                            {formatCost(row.pollen_earned)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </>
            )}

            {state.hasMore && (
                <div className="flex items-center justify-end pt-1">
                    <Button
                        as="button"
                        onClick={handleLoadMore}
                        disabled={state.loading}
                    >
                        {state.loading ? "Loading…" : "More"}
                    </Button>
                </div>
            )}
        </div>
    );
};
