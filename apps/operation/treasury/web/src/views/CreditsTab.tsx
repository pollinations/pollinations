import {
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
    Text,
} from "@pollinations/ui";
import { useMemo, useState } from "react";
import { DataNote } from "../components/DataNote";
import { DataTable, TableScroller } from "../components/DataTable";
import { ValueWithSource } from "../components/Provenance";
import { fmtUsd, fmtUsd2 } from "../lib/format";
import type { BalanceRow, Data, GrantRow } from "../types";

const CATEGORY_OPTIONS = [
    "all",
    "compute",
    "infra",
    "saas",
    "payroll",
    "other",
];

function sortedGrants(rows: GrantRow[]) {
    return [...rows].sort((a, b) => a.pool.localeCompare(b.pool));
}

function sortedBalances(rows: BalanceRow[]) {
    return [...rows].sort((a, b) => a.provider.localeCompare(b.provider));
}

export function CreditsTab({ data }: { data: Data }) {
    const [category, setCategory] = useState("all");
    const grants = useMemo(
        () =>
            sortedGrants(data.grants).filter(
                (row) => category === "all" || row.category === category,
            ),
        [data.grants, category],
    );
    const balances = useMemo(
        () => sortedBalances(data.balances),
        [data.balances],
    );

    return (
        <div className="flex flex-col gap-6">
            <section className="flex flex-col gap-4">
                <DataNote
                    pipe="grants_ep"
                    rows={grants.length}
                    source="HC + provider API"
                    transform="Forager grant pool rows"
                    purpose="raw credit and prepaid pool inputs before burn"
                />
                <label className="inline-flex w-fit items-center gap-2 text-sm text-theme-text-soft">
                    category
                    <select
                        value={category}
                        onChange={(event) => setCategory(event.target.value)}
                        className="rounded border border-theme-border/70 bg-theme-bg px-2 py-1 text-theme-text-strong"
                    >
                        {CATEGORY_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                                {option}
                            </option>
                        ))}
                    </select>
                </label>
                <TableScroller>
                    <DataTable>
                        <TableHead>
                            <TableRow>
                                <TableHeaderCell>pool</TableHeaderCell>
                                <TableHeaderCell>providers</TableHeaderCell>
                                <TableHeaderCell>kind</TableHeaderCell>
                                <TableHeaderCell>category</TableHeaderCell>
                                <TableHeaderCell>currency</TableHeaderCell>
                                <TableHeaderCell>granted_usd</TableHeaderCell>
                                <TableHeaderCell>left_usd</TableHeaderCell>
                                <TableHeaderCell>
                                    prepaid_left_usd
                                </TableHeaderCell>
                                <TableHeaderCell>expires</TableHeaderCell>
                                <TableHeaderCell>note</TableHeaderCell>
                                <TableHeaderCell>run_at</TableHeaderCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {grants.map((row) => (
                                <TableRow key={row.pool}>
                                    <TableCell>{row.pool}</TableCell>
                                    <TableCell>
                                        {row.providers || "-"}
                                    </TableCell>
                                    <TableCell>{row.kind || "-"}</TableCell>
                                    <TableCell>{row.category || "-"}</TableCell>
                                    <TableCell>{row.currency || "-"}</TableCell>
                                    <TableCell>
                                        <ValueWithSource
                                            source={row.granted_src}
                                        >
                                            {fmtUsd(row.granted_usd)}
                                        </ValueWithSource>
                                    </TableCell>
                                    <TableCell>
                                        <ValueWithSource source={row.left_src}>
                                            {fmtUsd2(row.left_usd)}
                                        </ValueWithSource>
                                    </TableCell>
                                    <TableCell>
                                        <ValueWithSource
                                            source={row.prepaid_left_src}
                                        >
                                            {fmtUsd2(row.prepaid_left_usd)}
                                        </ValueWithSource>
                                    </TableCell>
                                    <TableCell>{row.expires || "-"}</TableCell>
                                    <TableCell title={row.note}>
                                        <Text as="span" tone="soft">
                                            {row.note || "-"}
                                        </Text>
                                    </TableCell>
                                    <TableCell>{row.run_at || "-"}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </DataTable>
                </TableScroller>
            </section>

            <section className="flex flex-col gap-4">
                <DataNote
                    pipe="balances_ep"
                    rows={balances.length}
                    source="provider API/CLI/BQ + HC"
                    transform="Forager latest balance snapshot"
                    purpose="raw latest credit and prepaid balances by provider"
                />
                <TableScroller>
                    <DataTable>
                        <TableHead>
                            <TableRow>
                                <TableHeaderCell>provider</TableHeaderCell>
                                <TableHeaderCell>granted_usd</TableHeaderCell>
                                <TableHeaderCell>spent_usd</TableHeaderCell>
                                <TableHeaderCell>left_usd</TableHeaderCell>
                                <TableHeaderCell>
                                    prepaid_left_usd
                                </TableHeaderCell>
                                <TableHeaderCell>note</TableHeaderCell>
                                <TableHeaderCell>last_run_at</TableHeaderCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {balances.map((row) => (
                                <TableRow key={row.provider}>
                                    <TableCell>{row.provider}</TableCell>
                                    <TableCell>
                                        <ValueWithSource source={row.source}>
                                            {fmtUsd(row.granted_usd)}
                                        </ValueWithSource>
                                    </TableCell>
                                    <TableCell>
                                        <ValueWithSource source={row.source}>
                                            {fmtUsd(row.spent_usd)}
                                        </ValueWithSource>
                                    </TableCell>
                                    <TableCell>
                                        <ValueWithSource source={row.source}>
                                            {fmtUsd2(row.left_usd)}
                                        </ValueWithSource>
                                    </TableCell>
                                    <TableCell>
                                        <ValueWithSource source={row.source}>
                                            {fmtUsd2(row.prepaid_left_usd)}
                                        </ValueWithSource>
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
                            ))}
                        </TableBody>
                    </DataTable>
                </TableScroller>
            </section>
        </div>
    );
}
