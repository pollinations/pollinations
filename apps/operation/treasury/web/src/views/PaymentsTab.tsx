import {
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
import { SourceCell } from "../components/Provenance";
import { fmtMoney } from "../lib/format";
import { matchesMonth } from "../lib/months";
import { queuedPaymentRuleKey } from "../lib/queued";
import { type StageInput, useStaging } from "../lib/staging";
import type { Data, PaymentTxRow } from "../types";

const PAYMENT_CATEGORIES = [
    "compute",
    "infra",
    "saas",
    "admin",
    "office",
    "payroll",
    "other",
    "unmatched",
];

function nowDateTime() {
    return new Date().toISOString().replace("T", " ").slice(0, 19);
}

export function buildPaymentRuleChange({
    category,
    counterparty,
    enteredAt = nowDateTime(),
    note = "",
}: {
    category: string;
    counterparty: string;
    enteredAt?: string;
    note?: string;
}): StageInput {
    return {
        datasource: "overrides",
        key: `payments:${counterparty}`,
        row: {
            entered_at: enteredAt,
            scope: "payments",
            key: counterparty,
            field: "category",
            value_num: null,
            value_str: category,
            note,
        },
        summary: `payments ${counterparty} category -> ${category}`,
    };
}

function sortedTx(rows: PaymentTxRow[]) {
    return [...rows].sort(
        (a, b) =>
            b.paid_at.localeCompare(a.paid_at) ||
            a.counterparty.localeCompare(b.counterparty),
    );
}

function paymentRowKey(row: PaymentTxRow) {
    return `${row.paid_at}|${row.counterparty}|${row.amount_eur}|${row.provider}|${row.category}`;
}

function stagedPaymentCounterparties(
    changes: { datasource: string; row: Record<string, unknown> }[],
) {
    const parties = new Set<string>();
    for (const change of changes) {
        if (
            change.datasource === "overrides" &&
            change.row.scope === "payments"
        ) {
            const key = change.row.key;
            if (typeof key === "string") parties.add(key);
        }
    }
    return parties;
}

// Staging is by counterparty, so editing one transaction stages the category
// rule for every payment from that counterparty.
function PaymentCategoryCell({ row }: { row: PaymentTxRow }) {
    const { changes, stage, unstage } = useStaging();
    const stageKey = `payments:${row.counterparty}`;
    const staged = changes.find((change) => change.key === stageKey);
    const category = staged
        ? String(staged.row.value_str ?? "")
        : row.category || "unmatched";
    const dirty = category !== (row.category || "unmatched");

    const update = (next: string) => {
        if (!PAYMENT_CATEGORIES.includes(next)) return;
        if (next === row.category) {
            unstage(stageKey);
        } else {
            stage(
                buildPaymentRuleChange({
                    category: next,
                    counterparty: row.counterparty,
                }),
            );
        }
    };

    return (
        <select
            value={category}
            onChange={(event) => update(event.target.value)}
            aria-label="category"
            className={dirtyControlClass(
                dirty,
                "rounded border border-theme-border/70 bg-theme-bg px-2 py-1 text-theme-text-strong",
            )}
        >
            {PAYMENT_CATEGORIES.map((option) => (
                <option key={option} value={option}>
                    {option}
                </option>
            ))}
        </select>
    );
}

export function PaymentsTab({
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
    const { changes } = useStaging();
    const stagedCounterparties = useMemo(
        () => stagedPaymentCounterparties(changes),
        [changes],
    );

    const baseTransactions = useMemo(
        () =>
            sortedTx(data.paymentsTx).filter(
                (row) =>
                    matchesMonth(row.paid_at, month) &&
                    (provider === "all" || row.provider === provider) &&
                    (category === "all" || row.category === category),
            ),
        [data.paymentsTx, month, provider, category],
    );
    const sortColumns = useMemo<SortColumn<PaymentTxRow>[]>(
        () => [
            {
                key: "provider",
                value: (row) => row.provider || row.counterparty,
            },
            { key: "category", value: (row) => row.category },
            { key: "paid_at", value: (row) => row.paid_at },
            { key: "source", value: () => "wise" },
            { key: "amount", value: (row) => row.amount_eur },
        ],
        [],
    );
    const { headerProps, rows: transactions } = useSortableRows(
        baseTransactions,
        sortColumns,
    );
    return (
        <div className="flex flex-col gap-4">
            <TableScroller>
                <DataTable>
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell {...headerProps("provider")}>
                                provider
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("category")}>
                                category
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("paid_at")}>
                                time period
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("source")}>
                                source
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("amount")}>
                                amount
                            </TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {withUniqueRowKeys(transactions, paymentRowKey).map(
                            ({ key, row }) => {
                                const manualSource =
                                    stagedCounterparties.has(
                                        row.counterparty,
                                    ) ||
                                    queuedKeys.has(
                                        queuedPaymentRuleKey(row.counterparty),
                                    )
                                        ? "manual"
                                        : "";
                                return (
                                    <TableRow key={key}>
                                        <TableCell title={row.counterparty}>
                                            {row.provider ||
                                                row.counterparty ||
                                                "(unmatched)"}
                                        </TableCell>
                                        <TableCell>
                                            <PaymentCategoryCell row={row} />
                                        </TableCell>
                                        <TableCell>{row.paid_at}</TableCell>
                                        <TableCell>
                                            <SourceCell
                                                sources={["wise", manualSource]}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            {fmtMoney(row.amount_eur, "EUR")}
                                        </TableCell>
                                    </TableRow>
                                );
                            },
                        )}
                    </TableBody>
                </DataTable>
            </TableScroller>
        </div>
    );
}
