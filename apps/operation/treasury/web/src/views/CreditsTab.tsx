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
import { FilterBar, FilterSelect } from "../components/Filters";
import { SourcedAmount } from "../components/Provenance";
import { fmtUsd2 } from "../lib/format";
import { queuedGrantKey } from "../lib/queued";
import { type StageInput, useStaging } from "../lib/staging";
import type { Data, GrantRow } from "../types";

// Mirrors the grant values forager resolved from connector balances +
// overrides + hc; hidden implementation labels such as kind stay out of the
// operator table.
function sortedGrants(rows: GrantRow[]) {
    return [...rows].sort((a, b) => a.pool.localeCompare(b.pool));
}

function aliasMap(data: Data) {
    return new Map(
        data.providerAliases
            .filter((row) => row.alias && row.provider)
            .map((row) => [row.alias, row.provider]),
    );
}

function grantProviders(row: GrantRow, aliases: Map<string, string>) {
    const providers = row.providers
        .split(",")
        .map((provider) => provider.trim())
        .map((provider) => aliases.get(provider) ?? provider)
        .filter(Boolean);
    return [...new Set(providers)];
}

function grantProviderLabel(row: GrantRow, aliases: Map<string, string>) {
    return grantProviders(row, aliases).join(", ");
}

type GrantAmountField = "left_usd" | "prepaid_left_usd";

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
        key: `grants:${pool}:${field}`,
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
    { field: "left_usd", label: "left" },
    { field: "prepaid_left_usd", label: "prepaid" },
];

function stagedGrantPools(
    changes: { datasource: string; row: Record<string, unknown> }[],
) {
    const pools = new Set<string>();
    for (const change of changes) {
        if (
            change.datasource === "overrides" &&
            change.row.scope === "grants"
        ) {
            const key = change.row.key;
            if (typeof key === "string") pools.add(key);
        }
    }
    return pools;
}

// One editable amount cell. Mounts only while the row is open and the field is
// operator-owned (hc/manual); live API fields keep their read-only display even
// then. Seeded once from the pool (or the resolved value), re-staged per key.
function GrantAmountInput({
    field,
    row,
}: {
    field: GrantAmountField;
    row: GrantRow;
}) {
    const { changes, stage, unstage } = useStaging();
    const fieldKey = `grants:${row.pool}:${field}`;
    const [value, setValue] = useState(() => {
        const staged = changes.find((change) => change.key === fieldKey);
        if (staged) return String(staged.row.value_num ?? "");
        return row[field]?.toString() ?? "";
    });

    const update = (raw: string) => {
        setValue(raw);
        const parsed = Number(raw);
        if (raw.trim() === "" || parsed === (row[field] ?? null)) {
            unstage(fieldKey);
            return;
        }
        if (!Number.isFinite(parsed) || parsed < 0) {
            unstage(fieldKey); // invalid -> drop the pending change
            return;
        }
        stage(
            buildGrantOverrideChange({ field, pool: row.pool, value: parsed }),
        );
    };

    return (
        <Input
            type="number"
            min="0"
            step="0.01"
            value={value}
            onChange={(event) => update(event.target.value)}
            aria-label={field}
            className={`w-28 ${
                value.trim() === "" ||
                (Number.isFinite(Number(value)) && Number(value) >= 0)
                    ? ""
                    : "border-intent-danger-border"
            }`}
        />
    );
}

export function CreditsTab({
    committedNonce = 0,
    data,
    provider = "all",
    providers = ["all"],
    onProviderChange = () => {},
    queuedKeys = new Set<string>(),
}: {
    committedNonce?: number;
    data: Data;
    provider?: string;
    providers?: string[];
    onProviderChange?: (value: string) => void;
    queuedKeys?: ReadonlySet<string>;
}) {
    const { changes, resetNonce, unstage } = useStaging();
    // Open pools (amount cells live). Recovered from the pool on mount; wiped
    // when a commit lands.
    const [editing, setEditing] = useState<Set<string>>(() =>
        stagedGrantPools(changes),
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

    const toggle = (pool: string, open: boolean) => {
        if (!open) {
            for (const { field } of GRANT_FIELDS) {
                unstage(`grants:${pool}:${field}`);
            }
        }
        setEditing((current) => {
            const next = new Set(current);
            if (open) next.add(pool);
            else next.delete(pool);
            return next;
        });
    };
    const aliases = useMemo(() => aliasMap(data), [data]);

    const baseGrants = useMemo(
        () =>
            sortedGrants(data.grants).filter(
                (row) =>
                    (provider === "all" ||
                        grantProviders(row, aliases).includes(provider)) &&
                    (category === "all" || row.category === category),
            ),
        [data.grants, provider, category, aliases],
    );
    const categoryOptions = useMemo(() => {
        const options = new Set<string>();
        for (const row of data.grants) options.add(row.category || "");
        return ["all", ...[...options].sort((a, b) => a.localeCompare(b))];
    }, [data.grants]);
    const sortColumns = useMemo<SortColumn<GrantRow>[]>(
        () => [
            {
                key: "actions",
                value: (row) => queuedKeys.has(queuedGrantKey(row.pool)),
            },
            {
                key: "provider",
                value: (row) => grantProviderLabel(row, aliases),
            },
            { key: "category", value: (row) => row.category },
            { key: "left_usd", value: (row) => row.left_usd },
            {
                key: "prepaid_left_usd",
                value: (row) => row.prepaid_left_usd,
            },
            { key: "expires", value: (row) => row.expires },
        ],
        [queuedKeys, aliases],
    );
    const { headerProps, rows: grants } = useSortableRows(
        baseGrants,
        sortColumns,
    );

    return (
        <div className="flex flex-col gap-6">
            <section className="flex flex-col gap-4">
                <FilterBar>
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
                <TableScroller>
                    <DataTable>
                        <TableHead>
                            <TableRow>
                                <TableHeaderCell {...headerProps("actions")}>
                                    actions
                                </TableHeaderCell>
                                <TableHeaderCell {...headerProps("provider")}>
                                    provider
                                </TableHeaderCell>
                                <TableHeaderCell {...headerProps("category")}>
                                    category
                                </TableHeaderCell>
                                <TableHeaderCell {...headerProps("left_usd")}>
                                    left
                                </TableHeaderCell>
                                <TableHeaderCell
                                    {...headerProps("prepaid_left_usd")}
                                >
                                    prepaid
                                </TableHeaderCell>
                                <TableHeaderCell {...headerProps("expires")}>
                                    expires
                                </TableHeaderCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {withUniqueRowKeys(grants, (row) => row.pool).map(
                                ({ key, row }) => {
                                    const open = editing.has(row.pool);
                                    const cell = (
                                        field: GrantAmountField,
                                        value: number | null,
                                        source: string,
                                        format: (
                                            value: number | null,
                                        ) => string,
                                    ) =>
                                        open && canEditGrantSource(source) ? (
                                            <GrantAmountInput
                                                field={field}
                                                row={row}
                                            />
                                        ) : (
                                            <SourcedAmount
                                                value={value}
                                                source={source}
                                                format={format}
                                            />
                                        );
                                    return (
                                        <TableRow key={key}>
                                            <TableCell>
                                                <Button
                                                    size="sm"
                                                    intent={
                                                        open ? "danger" : "info"
                                                    }
                                                    onClick={() =>
                                                        toggle(row.pool, !open)
                                                    }
                                                >
                                                    {open ? "Reset" : "Edit"}
                                                </Button>
                                            </TableCell>
                                            <TableCell>
                                                <span className="inline-flex items-center gap-1.5">
                                                    {grantProviderLabel(
                                                        row,
                                                        aliases,
                                                    ) || "-"}
                                                    {queuedKeys.has(
                                                        queuedGrantKey(
                                                            row.pool,
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
                                                {row.category || "-"}
                                            </TableCell>
                                            <TableCell>
                                                {cell(
                                                    "left_usd",
                                                    row.left_usd,
                                                    row.left_src,
                                                    fmtUsd2,
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {cell(
                                                    "prepaid_left_usd",
                                                    row.prepaid_left_usd,
                                                    row.prepaid_left_src,
                                                    fmtUsd2,
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {row.expires || "-"}
                                            </TableCell>
                                        </TableRow>
                                    );
                                },
                            )}
                        </TableBody>
                    </DataTable>
                </TableScroller>
            </section>
        </div>
    );
}
