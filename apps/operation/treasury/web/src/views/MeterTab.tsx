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
import type { Data, MeterMonthlyRow, OverrideRow } from "../types";

type MeterAmountField = "credit" | "paid";

function meterStageKey(month: string, provider: string, currency: string) {
    return `meter:${provider}:${month}:${currency}`;
}

function meterOverrideKey(month: string, provider: string, currency: string) {
    return `${provider}|${month}|${currency}`;
}

function hasManualSource(source: string) {
    return uniqueSources([source]).includes("manual");
}

function hasOnlyManualSource(source: string) {
    const sources = uniqueSources([source]);
    return sources.length === 1 && sources[0] === "manual";
}

function meterResetStageKey(month: string, provider: string, currency: string) {
    return `meter-reset:${meterOverrideKey(month, provider, currency)}`;
}

export type MeterStageChange = {
    datasource: string;
    key: string;
    row: Record<string, unknown>;
};

function numberValue(value: unknown) {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stagedMeterRow(
    changes: MeterStageChange[],
    month: string,
    provider: string,
    currency: string,
) {
    const key = meterStageKey(month, provider, currency);
    return changes.find((change) => change.key === key) ?? null;
}

function stagedMeterReset(
    changes: MeterStageChange[],
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

function meterOverridesFromChanges(changes: MeterStageChange[]): OverrideRow[] {
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
    paidAmount: number,
) {
    return field === "credit" ? creditAmount : paidAmount;
}

function MeterAmountInput({
    paidAmount,
    creditAmount,
    currency,
    field,
    manual,
    manualOnly,
    month,
    provider,
}: {
    paidAmount: number;
    creditAmount: number;
    currency: string;
    field: MeterAmountField;
    manual: boolean;
    manualOnly: boolean;
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
        ? numberValue(overlay.row.credit)
        : creditAmount;
    const overlayPaid = overlay ? numberValue(overlay.row.paid) : paidAmount;
    const hasPendingReset = pendingReset === true;
    const displayCredit =
        hasPendingReset && manualOnly && !pendingRow ? 0 : overlayCredit;
    const displayPaid =
        hasPendingReset && manualOnly && !pendingRow ? 0 : overlayPaid;
    const initial = fieldAmount(field, creditAmount, paidAmount);
    const input = String(fieldAmount(field, displayCredit, displayPaid));
    const hasPendingField =
        hasPendingReset ||
        (pendingRow !== null &&
            fieldAmount(field, overlayCredit, overlayPaid) !== initial);
    const hasPendingRow = pendingRow !== null || pendingReset !== null;
    const hasSavedEdit =
        manual || committedRow !== null || committedReset === false;
    const showReset = hasPendingRow || hasSavedEdit;

    const stageAmounts = (nextCredit: number, nextPaid: number) => {
        if (nextCredit === creditAmount && nextPaid === paidAmount) {
            unstage(stageKey);
            unstage(resetKey);
            return;
        }
        stage(
            buildManualMeterChange({
                paidAmount: nextPaid,
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
            field === "credit" ? parsed : overlayCredit,
            field === "paid" ? parsed : overlayPaid,
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
    meterRows,
    month,
    overrides = [],
    provider,
}: {
    meterRows: MeterMonthlyRow[];
    month: string;
    overrides?: OverrideRow[];
    provider: string;
}) {
    return effectiveMeterRowsWithOverrides({ meterRows, overrides }).filter(
        (row) =>
            matchesMonth(row.month, month) &&
            (provider === "all" || row.provider === provider),
    );
}

export function visibleMeterRowsForSession({
    committedChanges = [],
    meterRows,
    month,
    overrides = [],
    provider,
}: {
    committedChanges?: MeterStageChange[];
    meterRows: MeterMonthlyRow[];
    month: string;
    overrides?: OverrideRow[];
    provider: string;
}) {
    return visibleMeterRows({
        meterRows,
        month,
        overrides: [
            ...overrides,
            ...meterOverridesFromChanges(committedChanges),
        ],
        provider,
    });
}

export function MeterTab({
    data,
    month = "",
    provider = "all",
}: {
    data: Data;
    month?: string;
    provider?: string;
}) {
    const { committed } = useStaging();
    const baseRows = useMemo(
        () =>
            visibleMeterRowsForSession({
                committedChanges: committed,
                meterRows: data.meterMonthly,
                month,
                overrides: data.overrides,
                provider,
            }),
        [committed, data.meterMonthly, data.overrides, month, provider],
    );
    const sortColumns = useMemo<SortColumn<MeterMonthlyRow>[]>(
        () => [
            { key: "month", value: (row) => row.month },
            { key: "source", value: (row) => row.source },
            { key: "provider", value: (row) => row.provider },
            { key: "credit", value: (row) => row.credit },
            { key: "paid", value: (row) => row.paid },
            { key: "currency", value: (row) => row.currency },
        ],
        [],
    );
    const { headerProps, rows } = useSortableRows(baseRows, sortColumns, {
        key: "month",
        direction: "desc",
    });
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
                        <TableHeaderCell {...headerProps("credit")}>
                            credit
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("paid")}>
                            paid
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
                            `${row.month}|${row.provider}|${row.source}|${row.currency}|${row.credit}|${row.paid}`,
                    ).map(({ key, row }) => {
                        const manual = hasManualSource(row.source);
                        const manualOnly = hasOnlyManualSource(row.source);
                        return (
                            <TableRow key={key}>
                                <TableCell>{fmtPeriod(row.month)}</TableCell>
                                <TableCell>
                                    <SourceCell sources={[row.source]} />
                                </TableCell>
                                <TableCell>{row.provider}</TableCell>
                                <TableCell>
                                    <MeterAmountInput
                                        paidAmount={row.paid}
                                        creditAmount={row.credit}
                                        currency={row.currency}
                                        field="credit"
                                        manual={manual}
                                        manualOnly={manualOnly}
                                        month={row.month}
                                        provider={row.provider}
                                    />
                                </TableCell>
                                <TableCell>
                                    <MeterAmountInput
                                        paidAmount={row.paid}
                                        creditAmount={row.credit}
                                        currency={row.currency}
                                        field="paid"
                                        manual={manual}
                                        manualOnly={manualOnly}
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
