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
import { type StageInput, useStaging } from "../lib/staging";
import type { Data, ProviderAliasRow } from "../types";

const NEW_PREFIX = "provider_aliases:new:";

function nowDateTime() {
    return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function newId() {
    return (
        globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
    );
}

// Stage one alias -> provider mapping. `stageKey` lets a brand-new (draft) row
// keep a stable staging key while its alias is still being typed; existing rows key
// by their alias. Empty provider is a tombstone — the pipe drops it, so forager
// stops matching that string.
export function buildAliasChange({
    alias,
    enteredAt = nowDateTime(),
    provider,
    stageKey,
}: {
    alias: string;
    enteredAt?: string;
    provider: string;
    stageKey?: string;
}): StageInput {
    const key = alias.trim().toLowerCase();
    const slug = provider.trim().toLowerCase();
    return {
        datasource: "provider_aliases",
        key: stageKey ?? `provider_aliases:${key}`,
        row: {
            entered_at: enteredAt,
            alias: key,
            provider: slug,
            category: "",
            note: "",
        },
        summary: `alias ${key} -> ${slug || "(removed)"}`,
    };
}

function sortedAliases(rows: ProviderAliasRow[]) {
    return [...rows].sort(
        (a, b) =>
            a.provider.localeCompare(b.provider) ||
            a.alias.localeCompare(b.alias),
    );
}

type Change = { datasource: string; key: string; row: Record<string, unknown> };

// Existing aliases (in the live table) with a pending edit.
function stagedEditAliases(changes: Change[]) {
    const set = new Set<string>();
    for (const change of changes) {
        if (
            change.datasource === "provider_aliases" &&
            !change.key.startsWith(NEW_PREFIX)
        ) {
            const alias = String(change.row.alias ?? "");
            if (alias) set.add(alias);
        }
    }
    return set;
}

// Draft ids recovered from staging, so unsaved adds survive a tab switch.
function stagedDraftIds(changes: Change[]) {
    const ids: string[] = [];
    for (const change of changes) {
        if (
            change.datasource === "provider_aliases" &&
            change.key.startsWith(NEW_PREFIX)
        ) {
            ids.push(change.key.slice(NEW_PREFIX.length));
        }
    }
    return ids;
}

// The provider cell of an existing row, live. Editing to a different slug stages
// the mapping; clearing it stages a removal; reverting to the original drops the
// pending change.
function ProviderEditCell({
    known,
    row,
}: {
    known: Set<string>;
    row: ProviderAliasRow;
}) {
    const { changes, stage, unstage } = useStaging();
    const stageKey = `provider_aliases:${row.alias}`;
    const [value, setValue] = useState(() => {
        const staged = changes.find((change) => change.key === stageKey);
        return String(staged?.row.provider ?? row.provider);
    });

    const update = (next: string) => {
        setValue(next);
        if (next.trim().toLowerCase() === row.provider) {
            unstage(stageKey);
            return;
        }
        stage(buildAliasChange({ alias: row.alias, provider: next }));
    };

    const slug = value.trim().toLowerCase();
    return (
        <span className="inline-flex items-center gap-1.5">
            <Input
                value={value}
                onChange={(event) => update(event.target.value)}
                placeholder="provider (empty = remove)"
                aria-label="provider"
                list="alias-providers"
                className="w-52"
            />
            {slug !== "" && !known.has(slug) && (
                <Chip size="sm" intent="alpha">
                    new provider
                </Chip>
            )}
        </span>
    );
}

// A brand-new alias, edited in place. Stages under a stable draft key so typing
// the alias never orphans half-typed staging keys.
function DraftRow({
    id,
    known,
    onDiscard,
}: {
    id: string;
    known: Set<string>;
    onDiscard: (id: string) => void;
}) {
    const { changes, stage, unstage } = useStaging();
    const stageKey = `${NEW_PREFIX}${id}`;
    const staged = changes.find((change) => change.key === stageKey);
    const [alias, setAlias] = useState(() => String(staged?.row.alias ?? ""));
    const [provider, setProvider] = useState(() =>
        String(staged?.row.provider ?? ""),
    );

    const push = (nextAlias: string, nextProvider: string) => {
        if (!nextAlias.trim()) {
            unstage(stageKey);
            return;
        }
        stage(
            buildAliasChange({
                alias: nextAlias,
                provider: nextProvider,
                stageKey,
            }),
        );
    };

    return (
        <TableRow>
            <TableCell>
                <Button
                    size="sm"
                    intent="danger"
                    onClick={() => {
                        unstage(stageKey);
                        onDiscard(id);
                    }}
                >
                    Reset
                </Button>
            </TableCell>
            <TableCell>
                <Input
                    value={alias}
                    onChange={(event) => {
                        setAlias(event.target.value);
                        push(event.target.value, provider);
                    }}
                    placeholder="new alias (raw string)"
                    aria-label="new alias"
                    className="w-56 font-mono"
                />
            </TableCell>
            <TableCell>
                <span className="inline-flex items-center gap-1.5">
                    <Input
                        value={provider}
                        onChange={(event) => {
                            setProvider(event.target.value);
                            push(alias, event.target.value);
                        }}
                        placeholder="provider slug"
                        aria-label="new provider"
                        list="alias-providers"
                        className="w-52"
                    />
                    {provider.trim() !== "" &&
                        !known.has(provider.trim().toLowerCase()) && (
                            <Chip size="sm" intent="alpha">
                                new provider
                            </Chip>
                        )}
                </span>
            </TableCell>
        </TableRow>
    );
}

export function ProvidersTab({
    committedNonce = 0,
    data,
    provider = "all",
    providers = ["all"],
    onProviderChange = () => {},
}: {
    committedNonce?: number;
    data: Data;
    provider?: string;
    providers?: string[];
    onProviderChange?: (value: string) => void;
}) {
    const { changes, unstage } = useStaging();
    // Open existing aliases (provider cell live). Recovered from staging on
    // mount; wiped when a commit lands.
    const [editing, setEditing] = useState<Set<string>>(() =>
        stagedEditAliases(changes),
    );
    const [drafts, setDrafts] = useState<string[]>(() =>
        stagedDraftIds(changes),
    );
    const lastNonce = useRef(committedNonce);
    useEffect(() => {
        if (lastNonce.current !== committedNonce) {
            lastNonce.current = committedNonce;
            setEditing(new Set());
            setDrafts([]);
        }
    }, [committedNonce]);

    const toggle = (alias: string, open: boolean) => {
        if (!open) unstage(`provider_aliases:${alias}`);
        setEditing((current) => {
            const next = new Set(current);
            if (open) next.add(alias);
            else next.delete(alias);
            return next;
        });
    };
    const addDraft = () => setDrafts((current) => [...current, newId()]);
    const discardDraft = (id: string) =>
        setDrafts((current) => current.filter((draft) => draft !== id));

    const stagedEdits = useMemo(() => stagedEditAliases(changes), [changes]);
    const baseRows = useMemo(
        () =>
            sortedAliases(data.providerAliases).filter(
                (row) => provider === "all" || row.provider === provider,
            ),
        [data.providerAliases, provider],
    );
    const knownProviders = useMemo(() => {
        const slugs = new Set<string>();
        for (const row of data.providerAliases) {
            if (row.provider) slugs.add(row.provider);
        }
        for (const slug of providers) if (slug !== "all") slugs.add(slug);
        return [...slugs].sort((a, b) => a.localeCompare(b));
    }, [data.providerAliases, providers]);
    const knownProviderSet = useMemo(
        () => new Set(knownProviders),
        [knownProviders],
    );

    const sortColumns = useMemo<SortColumn<ProviderAliasRow>[]>(
        () => [
            { key: "actions", value: (row) => stagedEdits.has(row.alias) },
            { key: "alias", value: (row) => row.alias },
            { key: "provider", value: (row) => row.provider },
        ],
        [stagedEdits],
    );
    const { headerProps, rows } = useSortableRows(baseRows, sortColumns);

    return (
        <div className="flex flex-col gap-4">
            <FilterBar>
                <FilterSelect
                    label="provider"
                    value={provider}
                    onChange={onProviderChange}
                    options={providers}
                />
            </FilterBar>
            <datalist id="alias-providers">
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
                            <TableHeaderCell {...headerProps("alias")}>
                                alias
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("provider")}>
                                provider
                            </TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {withUniqueRowKeys(rows, (row) => row.alias).map(
                            ({ key, row }) => {
                                const open = editing.has(row.alias);
                                return (
                                    <TableRow key={key}>
                                        <TableCell>
                                            <Button
                                                size="sm"
                                                intent={
                                                    open ? "danger" : "info"
                                                }
                                                onClick={() =>
                                                    toggle(row.alias, !open)
                                                }
                                            >
                                                {open ? "Reset" : "Edit"}
                                            </Button>
                                        </TableCell>
                                        <TableCell>
                                            <span className="inline-flex items-center gap-1.5 font-mono">
                                                {row.alias}
                                                {stagedEdits.has(row.alias) && (
                                                    <Chip
                                                        size="sm"
                                                        intent="warning"
                                                    >
                                                        edited
                                                    </Chip>
                                                )}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            {open ? (
                                                <ProviderEditCell
                                                    known={knownProviderSet}
                                                    row={row}
                                                />
                                            ) : (
                                                row.provider || "-"
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            },
                        )}
                        {drafts.map((id) => (
                            <DraftRow
                                key={id}
                                id={id}
                                known={knownProviderSet}
                                onDiscard={discardDraft}
                            />
                        ))}
                        <TableRow>
                            <TableCell>
                                <Button
                                    size="sm"
                                    intent="info"
                                    onClick={addDraft}
                                >
                                    Add
                                </Button>
                            </TableCell>
                            <TableCell />
                            <TableCell />
                        </TableRow>
                    </TableBody>
                </DataTable>
            </TableScroller>
        </div>
    );
}
