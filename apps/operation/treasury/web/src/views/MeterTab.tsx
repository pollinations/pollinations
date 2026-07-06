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
import { dirtyControlClass, ResetCellButton } from "../components/EditableCell";
import {
    buildManualMeterChange,
    buildMeterManualResetChange,
    validateManualAmount,
} from "../components/UsageEntryForm";
import { matchesMonth } from "../lib/months";
import { useStaging } from "../lib/staging";
import type {
    Data,
    MeterMonthlyRow,
    OverrideRow,
    TransactionRow,
} from "../types";

function meterStageKey(
    month: string,
    provider: string,
    funding: string,
    currency: string,
) {
    return `meter:${provider}:${month}:${funding}:${currency}`;
}

function meterOverrideKey(
    month: string,
    provider: string,
    funding: string,
    currency: string,
) {
    return `${provider}|${month}|${funding}|${currency}`;
}

function meterResetStageKey(
    month: string,
    provider: string,
    funding: string,
    currency: string,
) {
    return `meter-reset:${meterOverrideKey(month, provider, funding, currency)}`;
}

type Change = { datasource: string; key: string; row: Record<string, unknown> };

function stagedMeterAmount(
    changes: Change[],
    month: string,
    provider: string,
    funding: string,
    currency: string,
) {
    const key = meterStageKey(month, provider, funding, currency);
    const staged = changes.find((change) => change.key === key);
    return staged ? String(staged.row.amount ?? "") : null;
}

function stagedMeterReset(
    changes: Change[],
    month: string,
    provider: string,
    funding: string,
    currency: string,
) {
    const key = meterResetStageKey(month, provider, funding, currency);
    const staged = changes.find((change) => change.key === key);
    if (!staged) return null;
    const value = String(staged.row.value_str ?? "");
    if (value === "1") return true;
    if (value === "0") return false;
    return null;
}

function meterOverridesFromChanges(changes: Change[]): OverrideRow[] {
    return changes
        .filter(
            (change) =>
                change.datasource === "overrides" &&
                change.row.scope === "meter_monthly" &&
                change.row.field === "reset_manual",
        )
        .map((change) => ({
            scope: String(change.row.scope ?? ""),
            key: String(change.row.key ?? ""),
            field: String(change.row.field ?? ""),
            value_num:
                typeof change.row.value_num === "number"
                    ? change.row.value_num
                    : null,
            value_str: String(change.row.value_str ?? ""),
        }));
}

function MeterAmountInput({
    amount,
    currency,
    funding,
    manual,
    month,
    provider,
}: {
    amount: number;
    currency: string;
    funding: string;
    manual: boolean;
    month: string;
    provider: string;
}) {
    const { changes, committed, stage, unstage } = useStaging();
    const stageKey = meterStageKey(month, provider, funding, currency);
    const resetKey = meterResetStageKey(month, provider, funding, currency);
    const pendingAmount = stagedMeterAmount(
        changes,
        month,
        provider,
        funding,
        currency,
    );
    const committedAmount = stagedMeterAmount(
        committed,
        month,
        provider,
        funding,
        currency,
    );
    const pendingReset = stagedMeterReset(
        changes,
        month,
        provider,
        funding,
        currency,
    );
    const committedReset = stagedMeterReset(
        committed,
        month,
        provider,
        funding,
        currency,
    );
    const overlayAmount = pendingAmount ?? committedAmount;
    const input = overlayAmount ?? String(amount);
    const hasPendingEdit = pendingAmount !== null || pendingReset !== null;
    const hasSavedEdit =
        manual || committedAmount !== null || committedReset === false;
    const showReset = hasPendingEdit || hasSavedEdit;

    const update = (next: string) => {
        if (next.trim() === "") {
            unstage(stageKey);
            unstage(resetKey);
            return;
        }
        const parsed = validateManualAmount(next);
        if (parsed === null) return;
        if (parsed === amount) {
            unstage(stageKey);
            unstage(resetKey);
            return;
        }
        stage(
            buildManualMeterChange({
                amount: parsed,
                currency,
                funding,
                month,
                provider,
            }),
        );
        stage(
            buildMeterManualResetChange({
                currency,
                funding,
                month,
                provider,
                reset: false,
            }),
        );
    };

    const reset = () => {
        if (hasPendingEdit) {
            unstage(stageKey);
            unstage(resetKey);
            return;
        }
        if (!hasSavedEdit) return;
        stage(
            buildMeterManualResetChange({
                currency,
                funding,
                month,
                provider,
                reset: true,
            }),
        );
    };

    return (
        <span className="inline-flex items-center gap-1.5">
            <Input
                type="number"
                min="0"
                step="0.01"
                value={input}
                error={hasPendingEdit}
                onChange={(event) => update(event.target.value)}
                aria-label="amount"
                className={dirtyControlClass(
                    hasPendingEdit,
                    "w-24 rounded border border-theme-border/70 bg-theme-bg px-2 py-1 text-theme-text-strong",
                )}
            />
            {showReset && (
                <ResetCellButton
                    kind={hasPendingEdit ? "undo" : "reset"}
                    title={
                        hasPendingEdit
                            ? "Undo pending usage edit"
                            : "Reset saved usage value"
                    }
                    onClick={reset}
                />
            )}
        </span>
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

export function meterResetOverrideKeys(overrides: OverrideRow[]) {
    return new Set(
        overrides
            .filter(
                (row) =>
                    row.scope === "meter_monthly" &&
                    row.field === "reset_manual" &&
                    row.value_str.trim() === "1",
            )
            .map((row) => row.key),
    );
}

export function effectiveMeterRowsWithOverrides({
    meterRows,
    overrides,
}: {
    meterRows: MeterMonthlyRow[];
    overrides: OverrideRow[];
}) {
    const resetKeys = meterResetOverrideKeys(overrides);
    if (resetKeys.size === 0) return meterRows;
    return meterRows.filter(
        (row) =>
            row.source !== "manual" ||
            !resetKeys.has(
                meterOverrideKey(
                    row.month,
                    row.provider,
                    row.funding,
                    row.currency,
                ),
            ),
    );
}

export function visibleMeterRows({
    category = "all",
    meterRows,
    month,
    overrides = [],
    provider,
    transactions = [],
}: {
    category?: string;
    meterRows: MeterMonthlyRow[];
    month: string;
    overrides?: OverrideRow[];
    provider: string;
    transactions?: TransactionRow[];
}) {
    const categoriesByProvider = providerCategoryMap(transactions);
    return effectiveMeterRowsWithOverrides({ meterRows, overrides }).filter(
        (row) =>
            matchesMonth(row.month, month) &&
            (provider === "all" || row.provider === provider) &&
            matchesCategory(row.provider, category, categoriesByProvider),
    );
}

export function MeterTab({
    category = "all",
    data,
    month = "",
    provider = "all",
}: {
    category?: string;
    data: Data;
    month?: string;
    provider?: string;
}) {
    const { changes, committed } = useStaging();
    const stagedOverrides = useMemo(
        () => meterOverridesFromChanges([...changes, ...committed]),
        [changes, committed],
    );
    const baseRows = useMemo(
        () =>
            visibleMeterRows({
                category,
                meterRows: data.meterMonthly,
                month,
                overrides: [...data.overrides, ...stagedOverrides],
                provider,
                transactions: data.transactions,
            }),
        [
            category,
            data.meterMonthly,
            data.overrides,
            data.transactions,
            month,
            provider,
            stagedOverrides,
        ],
    );
    const sortColumns = useMemo<SortColumn<MeterMonthlyRow>[]>(
        () => [
            { key: "month", value: (row) => row.month },
            { key: "source", value: (row) => row.source },
            { key: "provider", value: (row) => row.provider },
            { key: "funding", value: (row) => row.funding },
            { key: "amount", value: (row) => row.amount },
            { key: "currency", value: (row) => row.currency },
        ],
        [],
    );
    const { headerProps, rows } = useSortableRows(baseRows, sortColumns);
    return (
        <TableScroller>
            <DataTable>
                <TableHead>
                    <TableRow>
                        <TableHeaderCell {...headerProps("month")}>
                            month
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("source")}>
                            source
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("provider")}>
                            provider
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("funding")}>
                            funding
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("amount")}>
                            amount
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("currency")}>
                            currency
                        </TableHeaderCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {withUniqueRowKeys(
                        rows,
                        (row) =>
                            `${row.month}|${row.provider}|${row.funding}|${row.source}|${row.currency}|${row.amount}`,
                    ).map(({ key, row }) => {
                        return (
                            <TableRow key={key}>
                                <TableCell>{row.month}</TableCell>
                                <TableCell>{row.source}</TableCell>
                                <TableCell>{row.provider}</TableCell>
                                <TableCell>{row.funding}</TableCell>
                                <TableCell>
                                    <MeterAmountInput
                                        amount={row.amount}
                                        currency={row.currency}
                                        funding={row.funding}
                                        manual={row.source === "manual"}
                                        month={row.month}
                                        provider={row.provider}
                                    />
                                </TableCell>
                                <TableCell>{row.currency}</TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </DataTable>
        </TableScroller>
    );
}
