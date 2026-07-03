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
import { SourceMark, ValueWithSource } from "../components/Provenance";
import { buildManualBalanceChange } from "../components/UsageEntryForm";
import { fmtUsd, fmtUsd2 } from "../lib/format";
import { queuedBalanceKey, queuedGrantKey } from "../lib/queued";
import { type StageInput, useStaging } from "../lib/staging";
import type { BalanceRow, Data, GrantRow } from "../types";

const CATEGORY_OPTIONS = [
    "all",
    "compute",
    "infra",
    "saas",
    "admin",
    "office",
    "payroll",
    "other",
];

function sortedGrants(rows: GrantRow[]) {
    return [...rows].sort((a, b) => a.pool.localeCompare(b.pool));
}

function sortedBalances(rows: BalanceRow[]) {
    return [...rows].sort((a, b) => a.provider.localeCompare(b.provider));
}

function grantProviders(row: GrantRow) {
    return row.providers
        .split(",")
        .map((provider) => provider.trim())
        .filter(Boolean);
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

const GRANT_FIELDS: { field: GrantAmountField; label: string }[] = [
    { field: "granted_usd", label: "granted_usd" },
    { field: "left_usd", label: "left_usd" },
    { field: "prepaid_left_usd", label: "prepaid_left_usd" },
];

function grantFieldSource(row: GrantRow, field: GrantAmountField) {
    if (field === "granted_usd") return row.granted_src;
    if (field === "left_usd") return row.left_src;
    return row.prepaid_left_src;
}

function GrantEditor({ onClose, row }: { onClose: () => void; row: GrantRow }) {
    const { stage } = useStaging();
    const [values, setValues] = useState<Record<GrantAmountField, string>>({
        granted_usd: row.granted_usd?.toString() ?? "",
        left_usd: row.left_usd?.toString() ?? "",
        prepaid_left_usd: row.prepaid_left_usd?.toString() ?? "",
    });
    const [note, setNote] = useState("");
    const [error, setError] = useState("");

    return (
        <form
            className="flex flex-col gap-1.5"
            onSubmit={(event) => {
                event.preventDefault();
                let staged = 0;
                for (const { field } of GRANT_FIELDS) {
                    if (!canEditGrantSource(grantFieldSource(row, field))) {
                        continue;
                    }
                    const raw = values[field].trim();
                    if (raw === "") continue;
                    const parsed = Number(raw);
                    if (!Number.isFinite(parsed) || parsed < 0) {
                        setError(`${field}: number >= 0`);
                        return;
                    }
                    if (parsed === (row[field] ?? null)) continue;
                    stage(
                        buildGrantOverrideChange({
                            field,
                            note: note.trim(),
                            pool: row.pool,
                            value: parsed,
                        }),
                    );
                    staged += 1;
                }
                if (staged === 0) {
                    setError("nothing changed");
                    return;
                }
                onClose();
            }}
        >
            <div className="flex flex-wrap items-end gap-2">
                {GRANT_FIELDS.map(({ field, label }) => {
                    const editable = canEditGrantSource(
                        grantFieldSource(row, field),
                    );
                    return (
                        <div
                            key={field}
                            className="flex flex-col gap-1 text-xs font-bold uppercase text-theme-text-soft"
                        >
                            <span>{label}</span>
                            <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={values[field]}
                                onChange={(event) =>
                                    setValues((prev) => ({
                                        ...prev,
                                        [field]: event.target.value,
                                    }))
                                }
                                disabled={!editable}
                                aria-label={field}
                                title={
                                    editable
                                        ? undefined
                                        : "live API value — read-only"
                                }
                                className="w-32"
                            />
                        </div>
                    );
                })}
                <Input
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="optional note"
                    className="w-48"
                    aria-label="note"
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
                    "Greyed fields come from the live API and cannot be overridden."}
            </Text>
        </form>
    );
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

export function CreditsTab({
    data,
    queuedKeys = new Set<string>(),
}: {
    data: Data;
    queuedKeys?: ReadonlySet<string>;
}) {
    const [category, setCategory] = useState("all");
    const [provider, setProvider] = useState("all");
    const [editPool, setEditPool] = useState<string | null>(null);
    const [editBalance, setEditBalance] = useState<string | null>(null);
    const providerOptions = useMemo(() => {
        const options = new Set<string>();
        for (const row of data.grants) {
            for (const grantProvider of grantProviders(row)) {
                options.add(grantProvider);
            }
        }
        for (const row of data.balances) {
            options.add(row.provider || "");
        }
        return ["all", ...[...options].sort((a, b) => a.localeCompare(b))];
    }, [data.grants, data.balances]);
    const grants = useMemo(
        () =>
            sortedGrants(data.grants).filter((row) => {
                if (
                    provider !== "all" &&
                    !grantProviders(row).includes(provider)
                ) {
                    return false;
                }
                return category === "all" || row.category === category;
            }),
        [data.grants, category, provider],
    );
    const balances = useMemo(
        () =>
            sortedBalances(data.balances).filter(
                (row) => provider === "all" || row.provider === provider,
            ),
        [data.balances, provider],
    );

    return (
        <div className="flex flex-col gap-6">
            <section className="flex flex-col gap-4">
                <DataNote pipe="grants_ep" rows={grants.length}>
                    Credit and prepaid pools funding the burn: granted/left from
                    provider APIs <SourceMark code="API" />, manual values{" "}
                    <SourceMark code="HC" /> filling the holes.
                </DataNote>
                <div className="flex flex-wrap items-center gap-3">
                    <label className="inline-flex w-fit items-center gap-2 text-sm text-theme-text-soft">
                        provider
                        <select
                            value={provider}
                            onChange={(event) =>
                                setProvider(event.target.value)
                            }
                            className="max-w-56 rounded border border-theme-border/70 bg-theme-bg px-2 py-1 text-theme-text-strong"
                        >
                            {providerOptions.map((option) => (
                                <option key={option} value={option}>
                                    {option || "(blank)"}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="inline-flex w-fit items-center gap-2 text-sm text-theme-text-soft">
                        category
                        <select
                            value={category}
                            onChange={(event) =>
                                setCategory(event.target.value)
                            }
                            className="rounded border border-theme-border/70 bg-theme-bg px-2 py-1 text-theme-text-strong"
                        >
                            {CATEGORY_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                    {option}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
                <TableScroller>
                    <DataTable>
                        <TableHead>
                            <TableRow>
                                <TableHeaderCell>actions</TableHeaderCell>
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
                                <Fragment key={row.pool}>
                                    <TableRow>
                                        <TableCell>
                                            <button
                                                type="button"
                                                className="font-medium text-theme-link hover:underline"
                                                onClick={() =>
                                                    setEditPool(
                                                        editPool === row.pool
                                                            ? null
                                                            : row.pool,
                                                    )
                                                }
                                            >
                                                edit
                                            </button>
                                        </TableCell>
                                        <TableCell>
                                            <span className="inline-flex items-center gap-1.5">
                                                {row.pool}
                                                {queuedKeys.has(
                                                    queuedGrantKey(row.pool),
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
                                            {row.providers || "-"}
                                        </TableCell>
                                        <TableCell>{row.kind || "-"}</TableCell>
                                        <TableCell>
                                            {row.category || "-"}
                                        </TableCell>
                                        <TableCell>
                                            {row.currency || "-"}
                                        </TableCell>
                                        <TableCell>
                                            <ValueWithSource
                                                source={row.granted_src}
                                            >
                                                {fmtUsd(row.granted_usd)}
                                            </ValueWithSource>
                                        </TableCell>
                                        <TableCell>
                                            <ValueWithSource
                                                source={row.left_src}
                                            >
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
                                        <TableCell>
                                            {row.expires || "-"}
                                        </TableCell>
                                        <TableCell title={row.note}>
                                            <Text as="span" tone="soft">
                                                {row.note || "-"}
                                            </Text>
                                        </TableCell>
                                        <TableCell>
                                            {row.run_at || "-"}
                                        </TableCell>
                                    </TableRow>
                                    {editPool === row.pool && (
                                        <TableRow>
                                            <TableCell colSpan={12}>
                                                <GrantEditor
                                                    row={row}
                                                    onClose={() =>
                                                        setEditPool(null)
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
                <FxOverrideForm />
            </section>

            <section className="flex flex-col gap-4">
                <DataNote pipe="balances_ep" rows={balances.length}>
                    Latest what-is-left snapshot per provider, read live{" "}
                    <SourceMark code="API" /> or entered by hand{" "}
                    <SourceMark code="HC" /> — the reality check for the pools
                    above.
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
                                <TableHeaderCell>
                                    prepaid_left_usd
                                </TableHeaderCell>
                                <TableHeaderCell>note</TableHeaderCell>
                                <TableHeaderCell>last_run_at</TableHeaderCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {balances.map((row) => (
                                <Fragment key={row.provider}>
                                    <TableRow>
                                        <TableCell>
                                            <button
                                                type="button"
                                                className="font-medium text-theme-link hover:underline"
                                                onClick={() =>
                                                    setEditBalance(
                                                        editBalance ===
                                                            row.provider
                                                            ? null
                                                            : row.provider,
                                                    )
                                                }
                                            >
                                                edit
                                            </button>
                                        </TableCell>
                                        <TableCell>
                                            <span className="inline-flex items-center gap-1.5">
                                                {row.provider}
                                                {queuedKeys.has(
                                                    queuedBalanceKey(
                                                        row.provider,
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
                                            <ValueWithSource
                                                source={row.source}
                                            >
                                                {fmtUsd(row.granted_usd)}
                                            </ValueWithSource>
                                        </TableCell>
                                        <TableCell>
                                            <ValueWithSource
                                                source={row.source}
                                            >
                                                {fmtUsd(row.spent_usd)}
                                            </ValueWithSource>
                                        </TableCell>
                                        <TableCell>
                                            <ValueWithSource
                                                source={row.source}
                                            >
                                                {fmtUsd2(row.left_usd)}
                                            </ValueWithSource>
                                        </TableCell>
                                        <TableCell>
                                            <ValueWithSource
                                                source={row.source}
                                            >
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
            </section>
        </div>
    );
}
