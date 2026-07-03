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
import { useMemo, useState } from "react";
import { DataNote } from "../components/DataNote";
import { DataTable, TableScroller } from "../components/DataTable";
import { SourceBadge, SourceMark } from "../components/Provenance";
import {
    buildManualMeterChange,
    validateManualAmount,
} from "../components/UsageEntryForm";
import { fmtUsd2 } from "../lib/format";
import { queuedMeterKey } from "../lib/queued";
import { useStaging } from "../lib/staging";
import type { Data, MeterMonthlyRow } from "../types";

const FUNDING_OPTIONS = ["credit", "cash", "prepaid"];
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function currentMonth() {
    return new Date().toISOString().slice(0, 7);
}

function sortedMeter(rows: MeterMonthlyRow[]) {
    return [...rows].sort(
        (a, b) =>
            b.month.localeCompare(a.month) ||
            a.provider.localeCompare(b.provider) ||
            b.retrieved_at.localeCompare(a.retrieved_at),
    );
}

function MeterEntryForm({ knownProviders }: { knownProviders: string[] }) {
    const { stage } = useStaging();
    const [month, setMonth] = useState(currentMonth());
    const [provider, setProvider] = useState("");
    const [amount, setAmount] = useState("");
    const [funding, setFunding] = useState("credit");
    const [note, setNote] = useState("");
    const [error, setError] = useState("");

    return (
        <form
            className="flex flex-col gap-1.5"
            onSubmit={(event) => {
                event.preventDefault();
                const slug = provider.trim().toLowerCase();
                const parsed = validateManualAmount(amount);
                if (!MONTH_RE.test(month)) {
                    setError("month must be YYYY-MM");
                    return;
                }
                if (!slug) {
                    setError("provider slug required");
                    return;
                }
                if (parsed === null || amount.trim() === "") {
                    setError("amount must be a number >= 0");
                    return;
                }
                stage(
                    buildManualMeterChange({
                        amount: parsed,
                        funding,
                        month,
                        note: note.trim() || "entered in treasury app",
                        provider: slug,
                    }),
                );
                setAmount("");
                setNote("");
                setError("");
            }}
        >
            <div className="flex flex-wrap items-center gap-2">
                <Input
                    value={month}
                    onChange={(event) => setMonth(event.target.value)}
                    placeholder="YYYY-MM"
                    aria-label="month"
                    className="w-28"
                />
                <Input
                    value={provider}
                    onChange={(event) => setProvider(event.target.value)}
                    placeholder="provider slug"
                    aria-label="provider"
                    list="meter-entry-providers"
                    className="w-40"
                />
                <datalist id="meter-entry-providers">
                    {knownProviders.map((slug) => (
                        <option key={slug} value={slug} />
                    ))}
                </datalist>
                <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="amount USD"
                    aria-label="amount_usd"
                    className="w-32"
                />
                <select
                    value={funding}
                    onChange={(event) => setFunding(event.target.value)}
                    aria-label="funding"
                    className="rounded border border-theme-border/70 bg-theme-bg px-2 py-1 text-theme-text-strong"
                >
                    {FUNDING_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                            {option}
                        </option>
                    ))}
                </select>
                <Input
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="optional note"
                    className="w-48"
                    aria-label="note"
                />
                <Button type="submit" size="sm">
                    Stage entry
                </Button>
            </div>
            <Text size="sm" tone="soft">
                {error ||
                    "Adds a manual monthly value (source=manual). funding=credit counts as that month's credit burn on the next forager run."}
            </Text>
        </form>
    );
}

export function MeterTab({
    data,
    queuedKeys = new Set<string>(),
}: {
    data: Data;
    queuedKeys?: ReadonlySet<string>;
}) {
    const rows = useMemo(
        () => sortedMeter(data.meterMonthly),
        [data.meterMonthly],
    );
    const knownProviders = useMemo(() => {
        const slugs = new Set<string>();
        for (const row of data.coverage) slugs.add(row.provider);
        for (const row of data.meterMonthly) slugs.add(row.provider);
        return [...slugs].sort((a, b) => a.localeCompare(b));
    }, [data.coverage, data.meterMonthly]);

    return (
        <div className="flex flex-col gap-4">
            <DataNote pipe="meter_monthly_ep" rows={rows.length}>
                Provider-reported monthly cost: API/CLI/BigQuery reads{" "}
                <SourceMark code="API" /> plus hand-entered values{" "}
                <SourceMark code="HC" /> for providers we cannot query — the
                primary source for manual monthly credits.
            </DataNote>
            <MeterEntryForm knownProviders={knownProviders} />
            <TableScroller>
                <DataTable>
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell>month</TableHeaderCell>
                            <TableHeaderCell>provider</TableHeaderCell>
                            <TableHeaderCell>cost_usd</TableHeaderCell>
                            <TableHeaderCell>funding</TableHeaderCell>
                            <TableHeaderCell>source</TableHeaderCell>
                            <TableHeaderCell>retrieved_at</TableHeaderCell>
                            <TableHeaderCell>note</TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {rows.map((row) => (
                            <TableRow
                                key={`${row.month}|${row.provider}|${row.source}|${row.retrieved_at}`}
                            >
                                <TableCell>{row.month}</TableCell>
                                <TableCell>
                                    <span className="inline-flex items-center gap-1.5">
                                        {row.provider}
                                        {queuedKeys.has(
                                            queuedMeterKey(
                                                row.month,
                                                row.provider,
                                            ),
                                        ) && (
                                            <Chip size="sm" intent="warning">
                                                queued
                                            </Chip>
                                        )}
                                    </span>
                                </TableCell>
                                <TableCell>{fmtUsd2(row.cost_usd)}</TableCell>
                                <TableCell>{row.funding || "-"}</TableCell>
                                <TableCell>
                                    <SourceBadge source={row.source} />
                                </TableCell>
                                <TableCell>{row.retrieved_at || "-"}</TableCell>
                                <TableCell title={row.note}>
                                    <Text as="span" tone="soft">
                                        {row.note || "-"}
                                    </Text>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </DataTable>
            </TableScroller>
        </div>
    );
}
