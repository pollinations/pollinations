import {
    Button,
    Chip,
    Input,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
    Text,
} from "@pollinations/ui";
import { Fragment, useMemo, useState } from "react";
import { DataNote } from "../components/DataNote";
import { DataTable, TableScroller } from "../components/DataTable";
import { SourceMark } from "../components/Provenance";
import { fmtUsd2 } from "../lib/format";
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

function PaymentRuleEditor({
    knownProviders,
    onClose,
    row,
}: {
    knownProviders: string[];
    onClose: () => void;
    row: PaymentTxRow;
}) {
    const { stage } = useStaging();
    const [provider, setProvider] = useState(row.provider);
    const [note, setNote] = useState("");
    const [error, setError] = useState("");

    return (
        <form
            className="flex flex-col gap-1.5"
            onSubmit={(event) => {
                event.preventDefault();
                const slug = provider.trim().toLowerCase();
                if (!slug) {
                    setError("provider slug required");
                    return;
                }
                stage(
                    buildPaymentRuleChange({
                        counterparty: row.counterparty,
                        note: note.trim(),
                        provider: slug,
                    }),
                );
                onClose();
            }}
        >
            <div className="flex flex-wrap items-center gap-2">
                <Text as="span" size="sm" tone="soft">
                    every payment from{" "}
                    <span className="font-mono text-theme-text-strong">
                        {row.counterparty || "(blank)"}
                    </span>{" "}
                    is
                </Text>
                <Input
                    value={provider}
                    onChange={(event) => setProvider(event.target.value)}
                    placeholder="provider slug"
                    aria-label="provider"
                    list="payment-rule-providers"
                    className="w-44"
                />
                <datalist id="payment-rule-providers">
                    {knownProviders.map((slug) => (
                        <option key={slug} value={slug} />
                    ))}
                </datalist>
                <Input
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="optional note"
                    className="w-44"
                    aria-label="note"
                />
                <Button type="submit" size="sm">
                    Stage rule
                </Button>
                <Button type="button" size="sm" onClick={onClose}>
                    Cancel
                </Button>
            </div>
            <Text size="sm" tone="soft">
                {error ||
                    "Applies to every past and future payment from this counterparty on the next ingest run."}
            </Text>
        </form>
    );
}

export function TransactionsTab({
    data,
    queuedKeys = new Set<string>(),
}: {
    data: Data;
    queuedKeys?: ReadonlySet<string>;
}) {
    const [unmatchedOnly, setUnmatchedOnly] = useState(false);
    const [editTx, setEditTx] = useState<string | null>(null);
    const transactions = useMemo(
        () =>
            sortedTx(data.paymentsTx).filter(
                (row) => !unmatchedOnly || row.provider === "",
            ),
        [data.paymentsTx, unmatchedOnly],
    );
    const knownProviders = useMemo(() => {
        const slugs = new Set<string>();
        for (const row of data.coverage) slugs.add(row.provider);
        for (const row of data.paymentsTx) {
            if (row.provider) slugs.add(row.provider);
        }
        return [...slugs].sort((a, b) => a.localeCompare(b));
    }, [data.coverage, data.paymentsTx]);

    return (
        <div className="flex flex-col gap-4">
            <DataNote pipe="payments_ep" rows={transactions.length}>
                Every Wise transaction <SourceMark code="WS" />. Edit sets a
                counterparty→provider rule <SourceMark code="HC" /> that forager
                applies to the whole history — the way to drain the (unmatched)
                bucket.
            </DataNote>
            <label className="inline-flex w-fit items-center gap-2 text-sm text-theme-text-soft">
                <input
                    type="checkbox"
                    checked={unmatchedOnly}
                    onChange={(event) => setUnmatchedOnly(event.target.checked)}
                />
                unmatched only
            </label>
            <TableScroller>
                <DataTable>
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell>actions</TableHeaderCell>
                            <TableHeaderCell>paid_at</TableHeaderCell>
                            <TableHeaderCell>counterparty</TableHeaderCell>
                            <TableHeaderCell>provider</TableHeaderCell>
                            <TableHeaderCell>category</TableHeaderCell>
                            <TableHeaderCell>amount_usd</TableHeaderCell>
                            <TableHeaderCell>amount_eur</TableHeaderCell>
                            <TableHeaderCell>wise_ref</TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {transactions.map((row) => (
                            <Fragment key={row.wise_ref}>
                                <TableRow>
                                    <TableCell>
                                        <Button
                                            size="sm"
                                            onClick={() =>
                                                setEditTx(
                                                    editTx === row.wise_ref
                                                        ? null
                                                        : row.wise_ref,
                                                )
                                            }
                                        >
                                            Edit
                                        </Button>
                                    </TableCell>
                                    <TableCell>{row.paid_at}</TableCell>
                                    <TableCell title={row.counterparty}>
                                        <span className="inline-flex items-center gap-1.5">
                                            {row.counterparty || "-"}
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
                                    </TableCell>
                                    <TableCell>
                                        {row.provider || "(unmatched)"}
                                    </TableCell>
                                    <TableCell>{row.category || "-"}</TableCell>
                                    <TableCell>
                                        {fmtUsd2(row.amount_usd)}
                                    </TableCell>
                                    <TableCell>
                                        €{row.amount_eur.toFixed(2)}
                                    </TableCell>
                                    <TableCell>
                                        <Text as="span" tone="soft">
                                            {row.wise_ref || "-"}
                                        </Text>
                                    </TableCell>
                                </TableRow>
                                {editTx === row.wise_ref && (
                                    <TableRow>
                                        <TableCell colSpan={8}>
                                            <PaymentRuleEditor
                                                row={row}
                                                knownProviders={knownProviders}
                                                onClose={() => setEditTx(null)}
                                            />
                                        </TableCell>
                                    </TableRow>
                                )}
                            </Fragment>
                        ))}
                    </TableBody>
                </DataTable>
            </TableScroller>
        </div>
    );
}
