import {
    Button,
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
import { ValueWithSource } from "../components/Provenance";
import { fmtUsd, fmtUsd2 } from "../lib/format";
import { type StageInput, useStaging } from "../lib/staging";
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

type GrantAmountField = "granted_usd" | "left_usd" | "prepaid_left_usd";

export function canEditGrantSource(source: string) {
    return ["", "hc", "manual"].includes(source.toLowerCase());
}

function nowDateTime() {
    return new Date().toISOString().replace("T", " ").slice(0, 19);
}

export function buildGrantOverrideChange({
    enteredAt = nowDateTime(),
    field,
    note = "",
    pool,
    value,
}: {
    enteredAt?: string;
    field: GrantAmountField;
    note?: string;
    pool: string;
    value: number;
}): StageInput {
    return {
        datasource: "overrides",
        row: {
            entered_at: enteredAt,
            scope: "grants",
            key: pool,
            field,
            value_num: value,
            value_str: "",
            note,
        },
        summary: `grants ${pool} ${field} -> ${value}`,
    };
}

export function buildFxOverrideChange({
    enteredAt = nowDateTime(),
    value,
}: {
    enteredAt?: string;
    value: number;
}): StageInput {
    return {
        datasource: "overrides",
        row: {
            entered_at: enteredAt,
            scope: "config",
            key: "fx_eur_usd",
            field: "value",
            value_num: value,
            value_str: "",
            note: "",
        },
        summary: `config fx_eur_usd -> ${value}`,
    };
}

function EditableGrantAmount({
    field,
    pool,
    source,
    value,
}: {
    field: GrantAmountField;
    pool: string;
    source: string;
    value: number | null;
}) {
    const { stage } = useStaging();
    const [editing, setEditing] = useState(false);
    const [nextValue, setNextValue] = useState(value?.toString() ?? "");
    const [note, setNote] = useState("");
    const [error, setError] = useState("");
    const editable = canEditGrantSource(source);
    const formatted = field === "granted_usd" ? fmtUsd(value) : fmtUsd2(value);

    if (!editable) {
        return <ValueWithSource source={source}>{formatted}</ValueWithSource>;
    }

    if (!editing) {
        return (
            <button
                type="button"
                className="text-left"
                onClick={() => {
                    setNextValue(value?.toString() ?? "");
                    setNote("");
                    setError("");
                    setEditing(true);
                }}
            >
                <ValueWithSource source={source}>{formatted}</ValueWithSource>
            </button>
        );
    }

    return (
        <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
                event.preventDefault();
                const parsed = Number(nextValue);
                if (!Number.isFinite(parsed) || parsed < 0) {
                    setError("number >= 0");
                    return;
                }
                stage(
                    buildGrantOverrideChange({
                        field,
                        note: note.trim(),
                        pool,
                        value: parsed,
                    }),
                );
                setEditing(false);
            }}
        >
            <Input
                type="number"
                min="0"
                step="0.01"
                value={nextValue}
                onChange={(event) => setNextValue(event.target.value)}
                className="w-28"
                aria-label={`${field} value`}
            />
            <Input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="note"
                className="w-32"
                aria-label={`${field} note`}
            />
            <Button type="submit" size="sm">
                Stage
            </Button>
            <Button type="button" size="sm" onClick={() => setEditing(false)}>
                Cancel
            </Button>
            {error && <Text className="text-intent-danger-text">{error}</Text>}
        </form>
    );
}

function FxOverrideForm() {
    const { stage } = useStaging();
    const [value, setValue] = useState("");
    const [error, setError] = useState("");

    return (
        <form
            className="flex flex-wrap items-center gap-2 border-theme-border/70 border-t pt-4"
            onSubmit={(event) => {
                event.preventDefault();
                const parsed = Number(value);
                if (!Number.isFinite(parsed) || parsed <= 0) {
                    setError("number > 0");
                    return;
                }
                stage(buildFxOverrideChange({ value: parsed }));
                setValue("");
                setError("");
            }}
        >
            <Text as="span" weight="bold">
                fx_eur_usd
            </Text>
            <Input
                type="number"
                min="0"
                step="0.0001"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder="1.14"
                className="w-32"
                aria-label="fx_eur_usd"
            />
            <Button type="submit" size="sm">
                Stage FX
            </Button>
            {error && <Text className="text-intent-danger-text">{error}</Text>}
        </form>
    );
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
                                        <EditableGrantAmount
                                            field="granted_usd"
                                            pool={row.pool}
                                            source={row.granted_src}
                                            value={row.granted_usd}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <EditableGrantAmount
                                            field="left_usd"
                                            pool={row.pool}
                                            source={row.left_src}
                                            value={row.left_usd}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <EditableGrantAmount
                                            field="prepaid_left_usd"
                                            pool={row.pool}
                                            source={row.prepaid_left_src}
                                            value={row.prepaid_left_usd}
                                        />
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
                <FxOverrideForm />
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
