import {
    Button,
    cn,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
} from "@pollinations/ui";
import { PaidChip, TierChip } from "@pollinations/ui/wallet";
import { type FC, useCallback, useEffect, useMemo, useState } from "react";
import { apiClient } from "../../api.ts";
import { formatActivityPollenThreshold } from "./format-activity-pollen.ts";
import type { UsagePeriodSelection } from "./types.ts";

type Mode = "compact" | "full";

type ApiKeyInfo = { id: string; name: string };

const PAGE_SIZE_FULL = 15;
const PAGE_SIZE_COMPACT = 5;
const EMPTY_FILTER_VALUES: string[] = [];
const TABLE_HEADER_CELL_CLASS = "px-2 py-1.5";
const TABLE_CELL_CLASS = "px-2 py-1.5 text-xs";

type UsageRecord = {
    timestamp: string;
    cursor_event_id: string;
    model: string;
    api_key_id: string | null;
    api_key: string | null;
    meter_source: string | null;
    cost_usd: number;
};

type UsageCursor = {
    timestamp: string;
    eventId: string;
};

type FetchState = {
    rows: UsageRecord[];
    loading: boolean;
    error: string | null;
    nextCursor: UsageCursor | null;
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

function formatTimestamp(value: string, mode: Mode): string {
    const date = parseTimestamp(value);
    if (Number.isNaN(date.getTime())) return value;
    if (mode === "compact") {
        return date.toLocaleString(undefined, {
            timeZone: "UTC",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    }
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

function rowKey(row: UsageRecord, index: number): string {
    if (row.cursor_event_id) return row.cursor_event_id;
    return `${row.timestamp}-${row.api_key_id ?? row.api_key ?? "key"}-${
        row.model || "model"
    }-${row.cost_usd}-${index}`;
}

function buildKeyNameLookup(keys: ApiKeyInfo[] | undefined) {
    const map = new Map<string, string>();
    for (const k of keys ?? []) map.set(k.id, k.name);
    return (id: string | null, fallbackName?: string | null) => {
        if (!id) return "—";
        return map.get(id) ?? fallbackName ?? `${id.slice(0, 8)}…`;
    };
}

export type TransactionHistoryProps = {
    mode?: Mode;
    apiKeys?: ApiKeyInfo[];
    period?: UsagePeriodSelection;
    selectedKeyIds?: string[];
    selectedModels?: string[];
    /** Hash route for the "View all" link in compact mode. */
    viewAllHref?: string;
};

export const TransactionHistory: FC<TransactionHistoryProps> = ({
    mode = "full",
    apiKeys,
    period,
    selectedKeyIds = EMPTY_FILTER_VALUES,
    selectedModels = EMPTY_FILTER_VALUES,
    viewAllHref = "#activity",
}) => {
    const [state, setState] = useState<FetchState>(INITIAL_STATE);
    const pageSize = mode === "compact" ? PAGE_SIZE_COMPACT : PAGE_SIZE_FULL;
    const lookupKeyName = useMemo(() => buildKeyNameLookup(apiKeys), [apiKeys]);

    const loadPage = useCallback(
        async (cursor: UsageCursor | null): Promise<void> => {
            setState((prev) => ({ ...prev, loading: true, error: null }));
            const query: {
                limit: string;
                before?: string;
                before_event_id?: string;
                granularity?: string;
                period?: string;
                api_key_ids?: string;
                models?: string;
            } = {
                limit: pageSize.toString(),
            };
            if (period) {
                query.granularity = period.granularity;
                query.period = period.period;
            }
            if (selectedKeyIds.length > 0) {
                query.api_key_ids = selectedKeyIds.join(",");
            }
            if (selectedModels.length > 0) {
                query.models = selectedModels.join(",");
            }
            if (cursor) {
                query.before = cursor.timestamp;
                query.before_event_id = cursor.eventId;
            }

            const response = await apiClient.account.usage.$get({ query });
            if (!response.ok) {
                setState((prev) => ({
                    ...prev,
                    loading: false,
                    error: `Failed to load transactions (${response.status})`,
                }));
                return;
            }

            const data = (await response.json()) as { usage: UsageRecord[] };
            const rows = data.usage ?? [];
            const hasMore = mode === "full" && rows.length >= pageSize;
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
        },
        [mode, pageSize, period, selectedKeyIds, selectedModels],
    );

    useEffect(() => {
        loadPage(null);
    }, [loadPage]);

    function handleLoadMore(): void {
        if (state.loading || !state.hasMore || !state.nextCursor) return;
        loadPage(state.nextCursor);
    }

    const showEmpty = state.rows.length === 0 && !state.loading && !state.error;
    const isCompact = mode === "compact";
    const status = renderStatus();
    const showFooter =
        Boolean(status) ||
        (isCompact && state.rows.length > 0) ||
        (!isCompact && state.hasMore);

    function renderStatus(): string {
        if (state.rows.length > 0) {
            return `Showing ${state.rows.length} ${
                isCompact ? "recent" : "most recent"
            }`;
        }
        return state.loading ? "Loading…" : "";
    }

    return (
        <div className="flex flex-col gap-3">
            {state.error && (
                <p className="text-sm text-intent-danger-500">{state.error}</p>
            )}

            {showEmpty && (
                <p className="text-sm text-ink-600">
                    No transactions yet. Once you start using the API your
                    deductions will appear here.
                </p>
            )}

            {state.rows.length > 0 && (
                <>
                    {/* Mobile: stacked cards */}
                    <ul className="flex flex-col gap-2 sm:hidden">
                        {state.rows.map((row, index) => (
                            <li
                                key={rowKey(row, index)}
                                className="flex flex-col gap-1.5 rounded-lg bg-surface-opaque p-3"
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <span className="font-semibold text-ink-900 truncate">
                                        {row.model || "—"}
                                    </span>
                                    <span className="tabular-nums font-semibold text-ink-900 shrink-0">
                                        {formatCost(row.cost_usd)}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between gap-2 text-xs">
                                    <span className="text-ink-600 tabular-nums">
                                        {formatTimestamp(row.timestamp, mode)}
                                    </span>
                                    <MeterSourceChip
                                        source={row.meter_source}
                                    />
                                </div>
                                {!isCompact && (
                                    <div className="text-xs text-ink-500 truncate">
                                        {lookupKeyName(
                                            row.api_key_id,
                                            row.api_key,
                                        )}
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>

                    {/* Desktop: table */}
                    <div
                        className={cn(
                            "hidden overflow-x-auto sm:block",
                            isCompact && "rounded-lg bg-surface-opaque",
                        )}
                    >
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
                                        Model
                                    </TableHeaderCell>
                                    {!isCompact && (
                                        <TableHeaderCell
                                            className={TABLE_HEADER_CELL_CLASS}
                                        >
                                            API Key
                                        </TableHeaderCell>
                                    )}
                                    <TableHeaderCell
                                        className={TABLE_HEADER_CELL_CLASS}
                                    >
                                        Source
                                    </TableHeaderCell>
                                    <TableHeaderCell
                                        align="right"
                                        className={TABLE_HEADER_CELL_CLASS}
                                    >
                                        Cost
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
                                            {formatTimestamp(
                                                row.timestamp,
                                                mode,
                                            )}
                                        </TableCell>
                                        <TableCell
                                            className={`${TABLE_CELL_CLASS} text-ink-900`}
                                        >
                                            {row.model || "—"}
                                        </TableCell>
                                        {!isCompact && (
                                            <TableCell
                                                className={`${TABLE_CELL_CLASS} max-w-[12rem] truncate text-ink-700`}
                                            >
                                                {lookupKeyName(
                                                    row.api_key_id,
                                                    row.api_key,
                                                )}
                                            </TableCell>
                                        )}
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
                                            {formatCost(row.cost_usd)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </>
            )}

            {showFooter && (
                <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-ink-500">{status}</span>
                    {isCompact && state.rows.length > 0 && (
                        <a
                            href={viewAllHref}
                            className="text-sm font-medium text-ink-800 hover:underline"
                        >
                            View all →
                        </a>
                    )}
                    {!isCompact && state.hasMore && (
                        <Button
                            as="button"
                            onClick={handleLoadMore}
                            disabled={state.loading}
                        >
                            {state.loading ? "Loading…" : "Load more"}
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
};
