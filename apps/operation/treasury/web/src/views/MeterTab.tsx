import {
    Input,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
} from "@pollinations/ui";
import { useMemo } from "react";
import {
    DataTable,
    type SortColumn,
    TableScroller,
    useSortableRows,
    withUniqueRowKeys,
} from "../components/DataTable";
import { dirtyControlClass } from "../components/EditableCell";
import { SourceCell, uniqueSources } from "../components/Provenance";
import {
    buildManualMeterChange,
    validateManualAmount,
} from "../components/UsageEntryForm";
import { fmtPeriod } from "../lib/format";
import { matchesMonth } from "../lib/months";
import { queuedMeterKey } from "../lib/queued";
import { useStaging } from "../lib/staging";
import type {
    Data,
    MeterMonthlyRow,
    TransactionRow,
    UsageMonthlyRow,
} from "../types";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
type UsageBucket = "credit" | "prepaid";

type MeterUsageRow = {
    month: string;
    provider: string;
    creditUsage: number;
    prepaidUsage: number;
    sources: string[];
};

function usageBucket(funding: string): UsageBucket {
    return funding === "credit" ? "credit" : "prepaid";
}

function combineSources(...sources: string[]) {
    return uniqueSources(sources);
}

const METER_SOURCE_RANK: Record<string, number> = {
    manual: 0,
    api: 1,
    cli: 2,
    bq: 3,
};

function meterRowRank(row: MeterMonthlyRow) {
    return METER_SOURCE_RANK[row.source] ?? 99;
}

function effectiveMeterRows(rows: MeterMonthlyRow[]): MeterMonthlyRow[] {
    const byBucket = new Map<string, MeterMonthlyRow>();

    for (const row of rows) {
        const key = `${row.month}|${row.provider}|${usageBucket(row.funding)}`;
        const current = byBucket.get(key);
        if (!current || meterRowRank(row) <= meterRowRank(current)) {
            byBucket.set(key, row);
        }
    }

    return [...byBucket.values()];
}

export function aggregateMeterRows(rows: MeterMonthlyRow[]): MeterUsageRow[] {
    const byKey = new Map<string, MeterUsageRow>();

    for (const row of effectiveMeterRows(rows)) {
        const key = `${row.month}|${row.provider}`;
        const current =
            byKey.get(key) ??
            ({
                month: row.month,
                provider: row.provider,
                creditUsage: 0,
                prepaidUsage: 0,
                sources: [],
            } satisfies MeterUsageRow);

        if (usageBucket(row.funding) === "credit") {
            current.creditUsage += row.cost_usd;
        } else {
            current.prepaidUsage += row.cost_usd;
        }
        current.sources = combineSources(...current.sources, row.source);
        byKey.set(key, current);
    }

    return [...byKey.values()].map((row) => ({
        ...row,
        creditUsage: Math.round(row.creditUsage * 100) / 100,
        prepaidUsage: Math.round(row.prepaidUsage * 100) / 100,
    }));
}

function sortedMeter(rows: MeterUsageRow[]) {
    return [...rows].sort(
        (a, b) =>
            b.month.localeCompare(a.month) ||
            a.provider.localeCompare(b.provider),
    );
}

export function withProviderBackfillRows({
    provider,
    rows,
    usageRows,
}: {
    provider: string;
    rows: MeterUsageRow[];
    usageRows: UsageMonthlyRow[];
}) {
    const byKey = new Map(
        rows.map((row) => [`${row.month}|${row.provider}`, row]),
    );

    for (const usage of usageRows) {
        if (!MONTH_RE.test(usage.month) || !usage.provider) continue;
        if (provider !== "all" && usage.provider !== provider) continue;

        const key = `${usage.month}|${usage.provider}`;
        if (!byKey.has(key)) {
            byKey.set(key, {
                month: usage.month,
                provider: usage.provider,
                creditUsage: 0,
                prepaidUsage: 0,
                sources: ["usage"],
            });
        }
    }

    return [...byKey.values()];
}

function meterEditKey(month: string, provider: string, funding: string) {
    return `${month}|${provider}|${funding}`;
}

function meterStageKey(month: string, provider: string, funding: string) {
    return `meter:${provider}:${month}:${funding}`;
}

type Change = { datasource: string; key: string; row: Record<string, unknown> };

function stagedMeterEdits(changes: Change[]) {
    const set = new Set<string>();
    for (const change of changes) {
        if (change.datasource !== "meter_monthly") continue;
        const month = String(change.row.month ?? "");
        const provider = String(change.row.provider ?? "");
        const funding = String(change.row.funding ?? "");
        if (month && provider && funding) {
            set.add(meterEditKey(month, provider, funding));
        }
    }
    return set;
}

function stagedMeterAmount(
    changes: Change[],
    month: string,
    provider: string,
    funding: string,
) {
    const key = meterStageKey(month, provider, funding);
    const staged = changes.find((change) => change.key === key);
    return staged ? String(staged.row.cost_usd ?? "") : null;
}

function MeterAmountInput({
    amount,
    bucket,
    month,
    provider,
}: {
    amount: number;
    bucket: UsageBucket;
    month: string;
    provider: string;
}) {
    const { changes, committed, stage, unstage } = useStaging();
    const stageKey = meterStageKey(month, provider, bucket);
    const overlayAmount =
        stagedMeterAmount(changes, month, provider, bucket) ??
        stagedMeterAmount(committed, month, provider, bucket);
    const input = overlayAmount ?? String(amount);
    const dirty = overlayAmount !== null;

    const update = (next: string) => {
        if (next.trim() === "") {
            unstage(stageKey);
            return;
        }
        const parsed = validateManualAmount(next);
        if (parsed === null) return;
        if (parsed === amount) {
            unstage(stageKey);
            return;
        }
        stage(
            buildManualMeterChange({
                amount: parsed,
                funding: bucket,
                month,
                provider,
            }),
        );
    };

    return (
        <Input
            type="number"
            min="0"
            step="0.01"
            value={input}
            onChange={(event) => update(event.target.value)}
            aria-label={`${bucket}_usage`}
            className={dirtyControlClass(
                dirty,
                "w-24 rounded border border-theme-border/70 bg-theme-bg px-2 py-1 text-theme-text-strong",
            )}
        />
    );
}

function providerCategoryMap(transactions: TransactionRow[]) {
    const map = new Map<string, Set<string>>();
    for (const row of transactions) {
        if (!row.provider || !row.category) continue;
        const categories = map.get(row.provider) ?? new Set<string>();
        categories.add(row.category);
        map.set(row.provider, categories);
    }
    return map;
}

function matchesCategory(
    provider: string,
    category: string,
    categoriesByProvider: Map<string, Set<string>>,
) {
    if (category === "all") return true;
    const categories = categoriesByProvider.get(provider);
    if (!categories) return category === "compute";
    return categories.has(category);
}

export function visibleMeterRows({
    category = "all",
    meterRows,
    month,
    provider,
    transactions = [],
    usageRows,
}: {
    category?: string;
    meterRows: MeterMonthlyRow[];
    month: string;
    provider: string;
    transactions?: TransactionRow[];
    usageRows: UsageMonthlyRow[];
}) {
    const categoriesByProvider = providerCategoryMap(transactions);
    const periodUsageRows = usageRows.filter((row) =>
        matchesMonth(row.month, month),
    );
    const periodMeterRows = aggregateMeterRows(meterRows).filter(
        (row) =>
            matchesMonth(row.month, month) &&
            (provider === "all" || row.provider === provider) &&
            matchesCategory(row.provider, category, categoriesByProvider),
    );
    return sortedMeter(
        withProviderBackfillRows({
            provider,
            rows: periodMeterRows,
            usageRows: periodUsageRows.filter((row) =>
                matchesCategory(row.provider, category, categoriesByProvider),
            ),
        }),
    );
}

export function MeterTab({
    category = "all",
    data,
    month = "",
    provider = "all",
    queuedKeys = new Set<string>(),
}: {
    category?: string;
    data: Data;
    month?: string;
    provider?: string;
    queuedKeys?: ReadonlySet<string>;
}) {
    const { changes, committed } = useStaging();
    const stagedEdits = useMemo(
        () => stagedMeterEdits([...changes, ...committed]),
        [changes, committed],
    );
    const baseRows = useMemo(
        () =>
            visibleMeterRows({
                category,
                meterRows: data.meterMonthly,
                month,
                provider,
                transactions: data.transactions,
                usageRows: data.usageMonthly,
            }),
        [
            category,
            data.meterMonthly,
            data.transactions,
            data.usageMonthly,
            month,
            provider,
        ],
    );
    const sortColumns = useMemo<SortColumn<MeterUsageRow>[]>(
        () => [
            { key: "month", value: (row) => row.month },
            { key: "provider", value: (row) => row.provider },
            {
                key: "source",
                value: (row) => row.sources.join(","),
            },
            { key: "creditUsage", value: (row) => row.creditUsage },
            { key: "prepaidUsage", value: (row) => row.prepaidUsage },
        ],
        [],
    );
    const { headerProps, rows } = useSortableRows(baseRows, sortColumns);
    return (
        <div className="flex flex-col gap-4">
            <TableScroller>
                <DataTable>
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell {...headerProps("month")}>
                                time period
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("source")}>
                                source
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("provider")}>
                                provider
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("creditUsage")}>
                                credit usage
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("prepaidUsage")}>
                                prepaid usage
                            </TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {withUniqueRowKeys(
                            rows,
                            (row) => `${row.month}|${row.provider}`,
                        ).map(({ key, row }) => {
                            const creditEditKey = meterEditKey(
                                row.month,
                                row.provider,
                                "credit",
                            );
                            const prepaidEditKey = meterEditKey(
                                row.month,
                                row.provider,
                                "prepaid",
                            );
                            const queued = queuedKeys.has(
                                queuedMeterKey(row.month, row.provider),
                            );
                            const staged =
                                stagedEdits.has(creditEditKey) ||
                                stagedEdits.has(prepaidEditKey);
                            const sources = combineSources(
                                ...row.sources,
                                queued || staged ? "manual" : "",
                            );
                            return (
                                <TableRow key={key}>
                                    <TableCell>
                                        {fmtPeriod(row.month)}
                                    </TableCell>
                                    <TableCell>
                                        <SourceCell sources={sources} />
                                    </TableCell>
                                    <TableCell>{row.provider}</TableCell>
                                    <TableCell>
                                        <MeterAmountInput
                                            amount={row.creditUsage}
                                            bucket="credit"
                                            month={row.month}
                                            provider={row.provider}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <MeterAmountInput
                                            amount={row.prepaidUsage}
                                            bucket="prepaid"
                                            month={row.month}
                                            provider={row.provider}
                                        />
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </DataTable>
            </TableScroller>
        </div>
    );
}
