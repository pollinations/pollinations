import { Button, type ThemeName } from "@pollinations/ui";
import { formatPollen, PaidChip, TierChip } from "@pollinations/ui/wallet";
import { type FC, useCallback, useEffect, useMemo, useState } from "react";
import { apiClient } from "../../api.ts";

type Mode = "compact" | "full";

type ApiKeyInfo = { id: string; name: string };

const PAGE_SIZE_FULL = 25;
const PAGE_SIZE_COMPACT = 5;

type UsageRecord = {
    timestamp: string;
    type: string;
    model: string;
    api_key: string | null;
    api_key_type: string | null;
    meter_source: string | null;
    cost_usd: number;
    response_time_ms: number | null;
};

type FetchState = {
    rows: UsageRecord[];
    loading: boolean;
    error: string | null;
    nextCursor: string | null;
    hasMore: boolean;
};

const INITIAL_STATE: FetchState = {
    rows: [],
    loading: true,
    error: null,
    nextCursor: null,
    hasMore: true,
};

function formatTimestamp(value: string, mode: Mode): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    if (mode === "compact") {
        // Relative-ish short form: "Mar 14, 14:05"
        return date.toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    }
    return date.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function MeterSourceChip({ source }: { source: string | null }) {
    if (source === "tier") return <TierChip>tier</TierChip>;
    return <PaidChip>paid</PaidChip>;
}

function rowKey(row: UsageRecord): string {
    return `${row.timestamp}-${row.model}-${row.cost_usd}`;
}

function buildKeyNameLookup(
    keys: ApiKeyInfo[] | undefined,
): (id: string | null) => string {
    const map = new Map<string, string>();
    for (const k of keys ?? []) map.set(k.id, k.name);
    return (id) => {
        if (!id) return "—";
        return map.get(id) ?? `${id.slice(0, 8)}…`;
    };
}

export type TransactionHistoryProps = {
    mode?: Mode;
    apiKeys?: ApiKeyInfo[];
    /** Hash route for the "View all" link in compact mode. */
    viewAllHref?: string;
    /** Theme used for the "Load more" button. */
    theme?: ThemeName;
};

export const TransactionHistory: FC<TransactionHistoryProps> = ({
    mode = "full",
    apiKeys,
    viewAllHref = "#activity",
    theme = "amber",
}) => {
    const [state, setState] = useState<FetchState>(INITIAL_STATE);
    const pageSize = mode === "compact" ? PAGE_SIZE_COMPACT : PAGE_SIZE_FULL;
    const lookupKeyName = useMemo(() => buildKeyNameLookup(apiKeys), [apiKeys]);

    const loadPage = useCallback(
        async (before: string | null): Promise<void> => {
            setState((prev) => ({ ...prev, loading: true, error: null }));
            const query: { limit: string; before?: string } = {
                limit: pageSize.toString(),
            };
            if (before) query.before = before;

            const response = await apiClient.account.usage.$get({ query });
            if (!response.ok) {
                setState((prev) => ({
                    ...prev,
                    loading: false,
                    error: `Failed to load transactions (${response.status})`,
                }));
                return;
            }

            const data = (await response.json()) as {
                usage: UsageRecord[];
                count: number;
            };
            const rows = data.usage ?? [];
            const hasMore = mode === "full" && rows.length >= pageSize;
            const last = rows[rows.length - 1];
            const nextCursor = hasMore && last ? last.timestamp : null;

            setState((prev) => ({
                rows: before ? [...prev.rows, ...rows] : rows,
                loading: false,
                error: null,
                nextCursor,
                hasMore,
            }));
        },
        [mode, pageSize],
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

    return (
        <div className="flex flex-col gap-3">
            {!isCompact && (
                <p className="text-sm text-ink-700">
                    Each row is one billed request — when it happened, which API
                    key and model were used, and how much pollen was deducted.
                </p>
            )}

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
                        {state.rows.map((row) => (
                            <li
                                key={rowKey(row)}
                                className="rounded-lg border border-theme-border p-3 flex flex-col gap-1.5"
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <span className="font-semibold text-ink-900 truncate">
                                        {row.model || "—"}
                                    </span>
                                    <span className="tabular-nums font-semibold text-ink-900 shrink-0">
                                        {formatPollen(row.cost_usd)}
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
                                        {lookupKeyName(row.api_key)}
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>

                    {/* Desktop: table */}
                    <div className="hidden sm:block overflow-x-auto rounded-lg border border-theme-border">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-ink-50 text-xs uppercase tracking-wide text-ink-700">
                                <tr>
                                    <th className="px-3 py-2 font-semibold">
                                        Time
                                    </th>
                                    <th className="px-3 py-2 font-semibold">
                                        Model
                                    </th>
                                    {!isCompact && (
                                        <th className="px-3 py-2 font-semibold">
                                            API Key
                                        </th>
                                    )}
                                    <th className="px-3 py-2 font-semibold">
                                        Source
                                    </th>
                                    <th className="px-3 py-2 font-semibold text-right">
                                        Cost
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-theme-border">
                                {state.rows.map((row) => (
                                    <tr
                                        key={rowKey(row)}
                                        className="hover:bg-ink-50"
                                    >
                                        <td className="px-3 py-2 whitespace-nowrap text-ink-800 tabular-nums">
                                            {formatTimestamp(
                                                row.timestamp,
                                                mode,
                                            )}
                                        </td>
                                        <td className="px-3 py-2 text-ink-900">
                                            {row.model || "—"}
                                        </td>
                                        {!isCompact && (
                                            <td className="px-3 py-2 text-ink-700 max-w-[12rem] truncate">
                                                {lookupKeyName(row.api_key)}
                                            </td>
                                        )}
                                        <td className="px-3 py-2">
                                            <MeterSourceChip
                                                source={row.meter_source}
                                            />
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-ink-900">
                                            {formatPollen(row.cost_usd)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-ink-500">
                    {state.rows.length === 0
                        ? state.loading
                            ? "Loading…"
                            : ""
                        : `Showing ${state.rows.length} ${
                              isCompact ? "recent" : "most recent"
                          }`}
                </span>
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
                        theme={theme}
                        onClick={handleLoadMore}
                        disabled={state.loading}
                    >
                        {state.loading ? "Loading…" : "Load more"}
                    </Button>
                )}
            </div>
        </div>
    );
};
