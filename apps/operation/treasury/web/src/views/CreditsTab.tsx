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
import { fmtUsd, fmtUsd2 } from "../lib/format";
import { queuedGrantKey } from "../lib/queued";
import { type StageInput, useStaging } from "../lib/staging";
import type { Data, GrantRow } from "../types";

// Credits = grant pools only. payg pools have nothing granted to track and
// prepaid balances live on the Provider Balance tab.
const GRANT_KINDS = new Set(["credit", "grant"]);

function sortedGrants(rows: GrantRow[]) {
    return [...rows].sort((a, b) => a.pool.localeCompare(b.pool));
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

export function CreditsTab({
    data,
    queuedKeys = new Set<string>(),
}: {
    data: Data;
    queuedKeys?: ReadonlySet<string>;
}) {
    const [provider, setProvider] = useState("all");
    const [editPool, setEditPool] = useState<string | null>(null);
    const grantPools = useMemo(
        () =>
            sortedGrants(data.grants).filter((row) =>
                GRANT_KINDS.has(row.kind.toLowerCase()),
            ),
        [data.grants],
    );
    const providerOptions = useMemo(() => {
        const options = new Set<string>();
        for (const row of grantPools) {
            for (const slug of grantProviders(row)) options.add(slug);
        }
        return ["all", ...[...options].sort((a, b) => a.localeCompare(b))];
    }, [grantPools]);
    const grants = useMemo(
        () =>
            grantPools.filter(
                (row) =>
                    provider === "all" ||
                    grantProviders(row).includes(provider),
            ),
        [grantPools, provider],
    );

    return (
        <div className="flex flex-col gap-6">
            <section className="flex flex-col gap-4">
                <DataNote pipe="grants_ep" rows={grants.length}>
                    Grant pools funding the burn: granted/left from provider
                    APIs <SourceMark code="API" />, manual values{" "}
                    <SourceMark code="HC" /> filling the holes. payg pools have
                    nothing granted; prepaid balances live on the Provider
                    Balance tab.
                </DataNote>
                <label className="inline-flex w-fit items-center gap-2 text-sm text-theme-text-soft">
                    provider
                    <select
                        value={provider}
                        onChange={(event) => setProvider(event.target.value)}
                        className="max-w-56 rounded border border-theme-border/70 bg-theme-bg px-2 py-1 text-theme-text-strong"
                    >
                        {providerOptions.map((option) => (
                            <option key={option} value={option}>
                                {option || "(blank)"}
                            </option>
                        ))}
                    </select>
                </label>
                <TableScroller>
                    <DataTable>
                        <TableHead>
                            <TableRow>
                                <TableHeaderCell>actions</TableHeaderCell>
                                <TableHeaderCell>pool</TableHeaderCell>
                                <TableHeaderCell>providers</TableHeaderCell>
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
                                            <Button
                                                size="sm"
                                                onClick={() =>
                                                    setEditPool(
                                                        editPool === row.pool
                                                            ? null
                                                            : row.pool,
                                                    )
                                                }
                                            >
                                                Edit
                                            </Button>
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
                                        <TableCell>
                                            {row.category || "-"}
                                        </TableCell>
                                        <TableCell>
                                            {row.currency || "-"}
                                        </TableCell>
                                        <TableCell>
                                            <SourcedAmount
                                                value={row.granted_usd}
                                                source={row.granted_src}
                                                format={fmtUsd}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <SourcedAmount
                                                value={row.left_usd}
                                                source={row.left_src}
                                                format={fmtUsd2}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <SourcedAmount
                                                value={row.prepaid_left_usd}
                                                source={row.prepaid_left_src}
                                                format={fmtUsd2}
                                            />
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
                                            <TableCell colSpan={11}>
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
            </section>
        </div>
    );
}
