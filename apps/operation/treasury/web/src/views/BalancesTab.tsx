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
import { SourcedAmount, SourceMark } from "../components/Provenance";
import { buildManualBalanceChange } from "../components/UsageEntryForm";
import { fmtUsd, fmtUsd2 } from "../lib/format";
import { queuedBalanceKey } from "../lib/queued";
import { useStaging } from "../lib/staging";
import type { BalanceRow, Data } from "../types";

function sortedBalances(rows: BalanceRow[]) {
    return [...rows].sort((a, b) => a.provider.localeCompare(b.provider));
}

function BalanceEditor({
    onClose,
    provider,
}: {
    onClose: () => void;
    provider: string;
}) {
    const { stage } = useStaging();
    const [amount, setAmount] = useState("");
    const [error, setError] = useState("");

    return (
        <form
            className="flex flex-col gap-1.5"
            onSubmit={(event) => {
                event.preventDefault();
                const parsed = Number(amount);
                if (
                    amount.trim() === "" ||
                    !Number.isFinite(parsed) ||
                    parsed < 0
                ) {
                    setError("number >= 0");
                    return;
                }
                stage(buildManualBalanceChange({ amount: parsed, provider }));
                onClose();
            }}
        >
            <div className="flex flex-wrap items-center gap-2">
                <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="left_usd now"
                    aria-label="left_usd"
                    className="w-36"
                />
                <Button type="submit" size="sm">
                    Stage
                </Button>
                <Button type="button" size="sm" onClick={onClose}>
                    Cancel
                </Button>
            </div>
            <Text size="sm" tone="soft">
                {error ||
                    "Manual snapshot of what is left — updates the display and pool balance, no monthly burn."}
            </Text>
        </form>
    );
}

export function BalancesTab({
    data,
    queuedKeys = new Set<string>(),
}: {
    data: Data;
    queuedKeys?: ReadonlySet<string>;
}) {
    const [editBalance, setEditBalance] = useState<string | null>(null);
    const balances = useMemo(
        () => sortedBalances(data.balances),
        [data.balances],
    );

    return (
        <div className="flex flex-col gap-4">
            <DataNote pipe="balances_ep" rows={balances.length}>
                Latest what-is-left snapshot per provider (credit and prepaid
                money parked at the provider), read live{" "}
                <SourceMark code="API" /> or entered by hand{" "}
                <SourceMark code="HC" />.
            </DataNote>
            <TableScroller>
                <DataTable>
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell>actions</TableHeaderCell>
                            <TableHeaderCell>provider</TableHeaderCell>
                            <TableHeaderCell>granted_usd</TableHeaderCell>
                            <TableHeaderCell>spent_usd</TableHeaderCell>
                            <TableHeaderCell>left_usd</TableHeaderCell>
                            <TableHeaderCell>prepaid_left_usd</TableHeaderCell>
                            <TableHeaderCell>note</TableHeaderCell>
                            <TableHeaderCell>last_run_at</TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {balances.map((row) => (
                            <Fragment key={row.provider}>
                                <TableRow>
                                    <TableCell>
                                        <Button
                                            size="sm"
                                            onClick={() =>
                                                setEditBalance(
                                                    editBalance === row.provider
                                                        ? null
                                                        : row.provider,
                                                )
                                            }
                                        >
                                            Edit
                                        </Button>
                                    </TableCell>
                                    <TableCell>
                                        <span className="inline-flex items-center gap-1.5">
                                            {row.provider}
                                            {queuedKeys.has(
                                                queuedBalanceKey(row.provider),
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
                                        <SourcedAmount
                                            value={row.granted_usd}
                                            source={row.source}
                                            format={fmtUsd}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <SourcedAmount
                                            value={row.spent_usd}
                                            source={row.source}
                                            format={fmtUsd}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <SourcedAmount
                                            value={row.left_usd}
                                            source={row.source}
                                            format={fmtUsd2}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <SourcedAmount
                                            value={row.prepaid_left_usd}
                                            source={row.source}
                                            format={fmtUsd2}
                                        />
                                    </TableCell>
                                    <TableCell title={row.note}>
                                        <Text as="span" tone="soft">
                                            {row.note || "-"}
                                        </Text>
                                    </TableCell>
                                    <TableCell>
                                        {row.last_run_at || "-"}
                                    </TableCell>
                                </TableRow>
                                {editBalance === row.provider && (
                                    <TableRow>
                                        <TableCell colSpan={8}>
                                            <BalanceEditor
                                                provider={row.provider}
                                                onClose={() =>
                                                    setEditBalance(null)
                                                }
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
