import {
    Chip,
    ClockIcon,
    InlineLink,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
} from "@pollinations/ui";
import { PaidChip, TierChip } from "@pollinations/ui/wallet";
import { type FC, useEffect, useMemo, useState } from "react";
import { apiClient } from "../../api.ts";
import { formatActivityPollenThreshold } from "../activity/format-activity-pollen.ts";
import type { ApiKey } from "../keys";

const EVENT_LIMIT = 10;
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

type FetchState = {
    rows: LastEvent[];
    loading: boolean;
    error: string | null;
};

const INITIAL_STATE: FetchState = {
    rows: [],
    loading: true,
    error: null,
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
    if (source === "tier") return <TierChip>tier</TierChip>;
    if (source === "pack") return <PaidChip>paid</PaidChip>;
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

    return [...usageEvents, ...earningsEvents]
        .sort((a, b) => timestampMs(b.timestamp) - timestampMs(a.timestamp))
        .slice(0, EVENT_LIMIT);
}

export const LastEventsPanel: FC<{ apiKeys: ApiKey[] }> = ({ apiKeys }) => {
    const [state, setState] = useState<FetchState>(INITIAL_STATE);
    const lookupKeyName = useMemo(() => buildKeyNameLookup(apiKeys), [apiKeys]);

    useEffect(() => {
        let cancelled = false;

        async function loadEvents(): Promise<void> {
            setState((prev) => ({ ...prev, loading: true, error: null }));

            const query = {
                limit: EVENT_LIMIT.toString(),
                days: RECENT_WINDOW_DAYS.toString(),
            };

            const [usageResponse, earningsResponse] = await Promise.all([
                apiClient.account.usage.$get({ query }),
                apiClient.account.earnings.transactions.$get({ query }),
            ]);

            if (cancelled) return;

            if (!usageResponse.ok || !earningsResponse.ok) {
                setState({
                    rows: [],
                    loading: false,
                    error: "Failed to load last events",
                });
                return;
            }

            const usageData = (await usageResponse.json()) as {
                usage: UsageEventRecord[];
            };
            const earningsData = (await earningsResponse.json()) as {
                transactions: EarningsEventRecord[];
            };

            if (cancelled) return;

            setState({
                rows: mergeLastEvents(
                    usageData.usage ?? [],
                    earningsData.transactions ?? [],
                    lookupKeyName,
                ),
                loading: false,
                error: null,
            });
        }

        loadEvents().catch(() => {
            if (cancelled) return;
            setState({
                rows: [],
                loading: false,
                error: "Failed to load last events",
            });
        });

        return () => {
            cancelled = true;
        };
    }, [lookupKeyName]);

    if (state.loading) {
        return (
            <p className="text-sm text-theme-text-muted animate-[pulse_2s_ease-in-out_infinite]">
                Loading…
            </p>
        );
    }

    if (state.error) {
        return <p className="text-sm text-intent-danger-text">{state.error}</p>;
    }

    if (state.rows.length === 0) {
        return (
            <p className="text-sm text-ink-600">
                No events yet. API usage and app earnings will appear here.{" "}
                <InlineLink href="#activity" showIcon={false}>
                    View activity
                </InlineLink>
                .
            </p>
        );
    }

    return (
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
                        {state.rows.map((event) => (
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

            <div className="mt-4 space-y-2 border-t border-divider pt-4 text-[13px] leading-snug text-theme-text-muted">
                <p className="flex items-start gap-1.5">
                    <ClockIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                        Showing the {state.rows.length} most recent event
                        {state.rows.length === 1 ? "" : "s"}.{" "}
                        <InlineLink href="#activity" showIcon={false}>
                            View full activity
                        </InlineLink>
                    </span>
                </p>
            </div>
        </div>
    );
};
