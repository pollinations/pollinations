import { Button, Section } from "@pollinations/ui";
import { formatPollen, PaidChip, TierChip } from "@pollinations/ui/wallet";
import { type FC, useCallback, useEffect, useState } from "react";
import { apiClient } from "../../api.ts";

const PAGE_SIZE = 25;

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

function formatTimestamp(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
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

export const TransactionHistory: FC = () => {
    const [state, setState] = useState<FetchState>(INITIAL_STATE);

    const loadPage = useCallback(
        async (before: string | null): Promise<void> => {
            setState((prev) => ({ ...prev, loading: true, error: null }));
            const query: { limit: string; before?: string } = {
                limit: PAGE_SIZE.toString(),
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
            const hasMore = rows.length >= PAGE_SIZE;
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
        [],
    );

    useEffect(() => {
        loadPage(null);
    }, [loadPage]);

    function handleLoadMore(): void {
        if (state.loading || !state.hasMore || !state.nextCursor) return;
        loadPage(state.nextCursor);
    }

    const showEmpty = state.rows.length === 0 && !state.loading && !state.error;

    return (
        <Section title="Transactions" theme="amber" framed>
            <div className="flex flex-col gap-3">
                <p className="text-sm text-ink-700">
                    Each row is one billed request — when it happened, which
                    model was called, and how much pollen was deducted.
                </p>

                {state.error && (
                    <p className="text-sm text-intent-danger-500">
                        {state.error}
                    </p>
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
                                            {formatTimestamp(row.timestamp)}
                                        </span>
                                        <MeterSourceChip
                                            source={row.meter_source}
                                        />
                                    </div>
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
                                                {formatTimestamp(row.timestamp)}
                                            </td>
                                            <td className="px-3 py-2 text-ink-900">
                                                {row.model || "—"}
                                            </td>
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
                        Showing {state.rows.length} most recent
                    </span>
                    {state.hasMore && (
                        <Button
                            as="button"
                            theme="amber"
                            onClick={handleLoadMore}
                            disabled={state.loading}
                        >
                            {state.loading ? "Loading…" : "Load more"}
                        </Button>
                    )}
                </div>
            </div>
        </Section>
    );
};
