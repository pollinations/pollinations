import {
    Button,
    Chip,
    Input,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
} from "@pollinations/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import {
    DataTable,
    type SortColumn,
    TableScroller,
    useSortableRows,
    withUniqueRowKeys,
} from "../components/DataTable";
import { FilterBar, FilterSelect, MonthFilter } from "../components/Filters";
import { fmtMoney } from "../lib/format";
import { matchesMonth } from "../lib/months";
import { queuedPaymentRuleKey } from "../lib/queued";
import { type StageInput, useStaging } from "../lib/staging";
import type { Data, PaymentTxRow } from "../types";

function nowDateTime() {
    return new Date().toISOString().replace("T", " ").slice(0, 19);
}

export function buildPaymentRuleChange({
    counterparty,
    enteredAt = nowDateTime(),
    note = "",
    provider,
}: {
    counterparty: string;
    enteredAt?: string;
    note?: string;
    provider: string;
}): StageInput {
    return {
        datasource: "overrides",
        key: `payments:${counterparty}`,
        row: {
            entered_at: enteredAt,
            scope: "payments",
            key: counterparty,
            field: "provider",
            value_num: null,
            value_str: provider,
            note,
        },
        summary: `payments ${counterparty} -> ${provider}`,
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
    return `${row.paid_at}|${row.counterparty}|${row.amount_eur}|${row.provider}|${row.category}|${row.wise_ref}`;
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

// The provider cell as a live input. Staging is by counterparty, so editing one
// transaction stages the rule that maps every payment from that counterparty.
function PaymentProviderCell({ row }: { row: PaymentTxRow }) {
    const { changes, stage, unstage } = useStaging();
    const stageKey = `payments:${row.counterparty}`;
    const [value, setValue] = useState(() => {
        const staged = changes.find((change) => change.key === stageKey);
        return staged ? String(staged.row.value_str ?? "") : row.provider;
    });

    const update = (next: string) => {
        setValue(next);
        const slug = next.trim().toLowerCase();
        if (!slug || slug === row.provider) {
            unstage(stageKey);
        } else {
            stage(
                buildPaymentRuleChange({
                    counterparty: row.counterparty,
                    provider: slug,
                }),
            );
        }
    };

    return (
        <Input
            value={value}
            onChange={(event) => update(event.target.value)}
            placeholder={row.counterparty || "provider slug"}
            aria-label="provider"
            list="payment-rule-providers"
            className="w-52"
        />
    );
}

export function PaymentsTab({
    committedNonce = 0,
    data,
    month = "",
    months = [],
    onMonthChange = () => {},
    onProviderChange = () => {},
    provider = "all",
    providers = ["all"],
    queuedKeys = new Set<string>(),
}: {
    committedNonce?: number;
    data: Data;
    month?: string;
    months?: string[];
    onMonthChange?: (value: string) => void;
    onProviderChange?: (value: string) => void;
    provider?: string;
    providers?: string[];
    queuedKeys?: ReadonlySet<string>;
}) {
    const { changes, resetNonce, unstage } = useStaging();
    // Open counterparties (the whole rule, not a single row). Recovered from
    // staging on mount; wiped when a commit lands.
    const [editing, setEditing] = useState<Set<string>>(() =>
        stagedPaymentCounterparties(changes),
    );
    const [category, setCategory] = useState("all");
    const lastNonce = useRef(committedNonce);
    const lastResetNonce = useRef(resetNonce);
    useEffect(() => {
        if (lastNonce.current !== committedNonce) {
            lastNonce.current = committedNonce;
            setEditing(new Set());
        }
    }, [committedNonce]);
    useEffect(() => {
        if (lastResetNonce.current !== resetNonce) {
            lastResetNonce.current = resetNonce;
            setEditing(new Set());
        }
    }, [resetNonce]);

    const toggle = (counterparty: string, open: boolean) => {
        if (!open) unstage(`payments:${counterparty}`);
        setEditing((current) => {
            const next = new Set(current);
            if (open) next.add(counterparty);
            else next.delete(counterparty);
            return next;
        });
    };

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
                key: "actions",
                value: (row) =>
                    queuedKeys.has(queuedPaymentRuleKey(row.counterparty)),
            },
            { key: "paid_at", value: (row) => row.paid_at },
            {
                key: "provider",
                value: (row) => row.provider || row.counterparty,
            },
            { key: "category", value: (row) => row.category },
            { key: "amount", value: (row) => row.amount_eur },
            { key: "wise_ref", value: (row) => row.wise_ref },
        ],
        [queuedKeys],
    );
    const { headerProps, rows: transactions } = useSortableRows(
        baseTransactions,
        sortColumns,
    );
    const knownProviders = useMemo(
        () => providers.filter((slug) => slug !== "all"),
        [providers],
    );
    const categoryOptions = useMemo(() => {
        const options = new Set<string>();
        for (const row of data.paymentsTx) options.add(row.category || "");
        return ["all", ...[...options].sort((a, b) => a.localeCompare(b))];
    }, [data.paymentsTx]);

    return (
        <div className="flex flex-col gap-4">
            <FilterBar>
                <MonthFilter
                    months={months}
                    value={month}
                    onChange={onMonthChange}
                />
                <FilterSelect
                    label="provider"
                    value={provider}
                    onChange={onProviderChange}
                    options={providers}
                />
                <FilterSelect
                    label="category"
                    value={category}
                    onChange={setCategory}
                    options={categoryOptions}
                />
            </FilterBar>
            <datalist id="payment-rule-providers">
                {knownProviders.map((slug) => (
                    <option key={slug} value={slug} />
                ))}
            </datalist>
            <TableScroller>
                <DataTable>
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell {...headerProps("actions")}>
                                actions
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("paid_at")}>
                                paid_at
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("provider")}>
                                provider
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("category")}>
                                category
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("amount")}>
                                amount
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("wise_ref")}>
                                wise_ref
                            </TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {withUniqueRowKeys(transactions, paymentRowKey).map(
                            ({ key, row }) => {
                                const open = editing.has(row.counterparty);
                                return (
                                    <TableRow key={key}>
                                        <TableCell>
                                            <Button
                                                size="sm"
                                                intent={
                                                    open ? "danger" : "info"
                                                }
                                                onClick={() =>
                                                    toggle(
                                                        row.counterparty,
                                                        !open,
                                                    )
                                                }
                                            >
                                                {open ? "Reset" : "Edit"}
                                            </Button>
                                        </TableCell>
                                        <TableCell>{row.paid_at}</TableCell>
                                        <TableCell title={row.counterparty}>
                                            {open ? (
                                                <PaymentProviderCell
                                                    row={row}
                                                />
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5">
                                                    {row.provider ||
                                                        row.counterparty ||
                                                        "(unmatched)"}
                                                    {queuedKeys.has(
                                                        queuedPaymentRuleKey(
                                                            row.counterparty,
                                                        ),
                                                    ) && (
                                                        <Chip
                                                            size="sm"
                                                            intent="warning"
                                                        >
                                                            queued
                                                        </Chip>
                                                    )}
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {row.category || "-"}
                                        </TableCell>
                                        <TableCell>
                                            {fmtMoney(row.amount_eur, "EUR")}
                                        </TableCell>
                                        <TableCell>
                                            {row.wise_ref || "-"}
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
