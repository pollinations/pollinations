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
import { SourceCell, uniqueSources } from "../components/Provenance";
import {
    buildManualMeterChange,
    buildMeterManualResetChange,
    validateManualAmount,
} from "../components/UsageEntryForm";
import { fmtPeriod } from "../lib/format";
import { matchesMonth } from "../lib/months";
import { useStaging } from "../lib/staging";
import type {
    Data,
    MeterMonthlyRow,
    OverrideRow,
    TransactionRow,
} from "../types";

type MeterAmountField = "credit_amount" | "cash_amount";

function meterStageKey(month: string, provider: string, currency: string) {
    return `meter:${provider}:${month}:${currency}`;
}

function meterOverrideKey(month: string, provider: string, currency: string) {
    return `${provider}|${month}|${currency}`;
}

function hasManualSource(source: string) {
    return uniqueSources([source]).includes("manual");
}

function meterResetStageKey(month: string, provider: string, currency: string) {
    return `meter-reset:${meterOverrideKey(month, provider, currency)}`;
}

type Change = { datasource: string; key: string; row: Record<string, unknown> };

function numberValue(value: unknown) {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stagedMeterRow(
    changes: Change[],
    month: string,
    provider: string,
    currency: string,
) {
    const key = meterStageKey(month, provider, currency);
    return changes.find((change) => change.key === key) ?? null;
}

function stagedMeterReset(
    changes: Change[],
    month: string,
    provider: string,
    currency: string,
) {
    const key = meterResetStageKey(month, provider, currency);
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

function fieldAmount(
    field: MeterAmountField,
    creditAmount: number,
    cashAmount: number,
) {
    return field === "credit_amount" ? creditAmount : cashAmount;
}

function MeterAmountInput({
    cashAmount,
    creditAmount,
    currency,
    field,
    manual,
    month,
    provider,
}: {
    cashAmount: number;
    creditAmount: number;
    currency: string;
    field: MeterAmountField;
    manual: boolean;
    month: string;
    provider: string;
}) {
    const { changes, committed, stage, unstage } = useStaging();
    const stageKey = meterStageKey(month, provider, currency);
    const resetKey = meterResetStageKey(month, provider, currency);
    const pendingRow = stagedMeterRow(changes, month, provider, currency);
    const committedRow = stagedMeterRow(committed, month, provider, currency);
    const pendingReset = stagedMeterReset(changes, month, provider, currency);
    const committedReset = stagedMeterReset(
        committed,
        month,
        provider,
        currency,
    );
    const overlay = pendingRow ?? committedRow;
    const overlayCredit = overlay
        ? numberValue(overlay.row.credit_amount)
        : creditAmount;
    const overlayCash = overlay
        ? numberValue(overlay.row.cash_amount)
        : cashAmount;
    const initial = fieldAmount(field, creditAmount, cashAmount);
    const input = String(fieldAmount(field, overlayCredit, overlayCash));
    const hasPendingField =
        pendingReset !== null ||
        (pendingRow !== null &&
            fieldAmount(field, overlayCredit, overlayCash) !== initial);
    const hasPendingRow = pendingRow !== null || pendingReset !== null;
    const hasSavedEdit =
        manual || committedRow !== null || committedReset === false;
    const showReset = hasPendingRow || hasSavedEdit;

    const stageAmounts = (nextCredit: number, nextCash: number) => {
        if (nextCredit === creditAmount && nextCash === cashAmount) {
            unstage(stageKey);
            unstage(resetKey);
            return;
        }
        stage(
            buildManualMeterChange({
                cashAmount: nextCash,
                creditAmount: nextCredit,
                currency,
                month,
                provider,
            }),
        );
        stage(
            buildMeterManualResetChange({
                currency,
                month,
                provider,
                reset: false,
            }),
        );
    };

    const update = (next: string) => {
        const parsed =
            next.trim() === "" ? initial : validateManualAmount(next);
        if (parsed === null) return;
        stageAmounts(
            field === "credit_amount" ? parsed : overlayCredit,
            field === "cash_amount" ? parsed : overlayCash,
        );
    };

    const reset = () => {
        if (hasPendingRow) {
            unstage(stageKey);
            unstage(resetKey);
            return;
        }
        if (!hasSavedEdit) return;
        stage(
            buildMeterManualResetChange({
                currency,
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
                error={hasPendingField}
                onChange={(event) => update(event.target.value)}
                aria-label={field}
                className={dirtyControlClass(
                    hasPendingField,
                    "w-24 rounded border border-theme-border/70 bg-theme-bg px-2 py-1 text-theme-text-strong",
                )}
            />
            {showReset && (
                <ResetCellButton
                    kind={hasPendingRow ? "undo" : "reset"}
                    title={
                        hasPendingRow
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
            !hasManualSource(row.source) ||
            !resetKeys.has(
                meterOverrideKey(row.month, row.provider, row.currency),
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
            { key: "credit_amount", value: (row) => row.credit_amount },
            { key: "cash_amount", value: (row) => row.cash_amount },
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
                            time period
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("source")}>
                            source
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("provider")}>
                            provider
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("credit_amount")}>
                            credit usage
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("cash_amount")}>
                            cash usage
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
                            `${row.month}|${row.provider}|${row.source}|${row.currency}|${row.credit_amount}|${row.cash_amount}`,
                    ).map(({ key, row }) => {
                        const manual = hasManualSource(row.source);
                        return (
                            <TableRow key={key}>
                                <TableCell>{fmtPeriod(row.month)}</TableCell>
                                <TableCell>
                                    <SourceCell sources={[row.source]} />
                                </TableCell>
                                <TableCell>{row.provider}</TableCell>
                                <TableCell>
                                    <MeterAmountInput
                                        cashAmount={row.cash_amount}
                                        creditAmount={row.credit_amount}
                                        currency={row.currency}
                                        field="credit_amount"
                                        manual={manual}
                                        month={row.month}
                                        provider={row.provider}
                                    />
                                </TableCell>
                                <TableCell>
                                    <MeterAmountInput
                                        cashAmount={row.cash_amount}
                                        creditAmount={row.credit_amount}
                                        currency={row.currency}
                                        field="cash_amount"
                                        manual={manual}
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
