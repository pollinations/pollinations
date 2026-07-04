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
import { SourceBadge } from "../components/Provenance";
import {
    buildManualMeterChange,
    validateManualAmount,
} from "../components/UsageEntryForm";
import { fmtUsd2 } from "../lib/format";
import { matchesMonth, monthLabel, monthName } from "../lib/months";
import { queuedMeterKey } from "../lib/queued";
import { useStaging } from "../lib/staging";
import type { Data, MeterMonthlyRow } from "../types";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const YEAR_RE = /^\d{4}$/;
type MeterFunding = "cash" | "credit";

function currentMonth() {
    return new Date().toISOString().slice(0, 7);
}

function sortedMeter(rows: MeterMonthlyRow[]) {
    return [...rows].sort(
        (a, b) =>
            b.month.localeCompare(a.month) ||
            a.provider.localeCompare(b.provider),
    );
}

function AmountWithSource({
    source,
    value,
}: {
    source: string;
    value: number;
}) {
    if (!value) return <span>-</span>;
    return (
        <span className="inline-flex items-center gap-1.5">
            {fmtUsd2(value)}
            {source && <SourceBadge source={source} />}
        </span>
    );
}

function selectedYear(period: string) {
    if (MONTH_RE.test(period)) return period.slice(0, 4);
    if (YEAR_RE.test(period)) return period;
    return currentMonth().slice(0, 4);
}

function entryMonthOptions(period: string, months: string[]) {
    const year = selectedYear(period);
    const options = months.filter((month) => month.startsWith(year));
    const current = currentMonth();
    const fallback = MONTH_RE.test(period)
        ? period
        : current.startsWith(year)
          ? current
          : (options.at(-1) ?? `${year}-01`);

    return options.includes(fallback)
        ? options
        : [...options, fallback].sort((a, b) => a.localeCompare(b));
}

function defaultEntryMonth(period: string, options: string[]) {
    if (MONTH_RE.test(period)) return period;
    const current = currentMonth();
    return options.includes(current) ? current : (options.at(-1) ?? current);
}

function newId() {
    return (
        globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
    );
}

function meterEditKey(month: string, provider: string) {
    return `${month}|${provider}`;
}

function meterStageKey(month: string, provider: string, funding: MeterFunding) {
    return `meter:${provider}:${month}:${funding}`;
}

type Change = { datasource: string; key: string; row: Record<string, unknown> };

function stagedMeterEdits(changes: Change[]) {
    const set = new Set<string>();
    for (const change of changes) {
        if (change.datasource !== "meter_monthly") continue;
        const month = String(change.row.month ?? "");
        const provider = String(change.row.provider ?? "");
        if (month && provider) set.add(meterEditKey(month, provider));
    }
    return set;
}

function stagedMeterAmount(
    changes: Change[],
    month: string,
    provider: string,
    funding: MeterFunding,
) {
    const key = meterStageKey(month, provider, funding);
    const staged = changes.find((change) => change.key === key);
    return staged ? String(staged.row.cost_usd ?? "") : null;
}

function MeterAmountInput({
    funding,
    row,
    value,
}: {
    funding: MeterFunding;
    row: MeterMonthlyRow;
    value: number;
}) {
    const { changes, stage, unstage } = useStaging();
    const stageKey = meterStageKey(row.month, row.provider, funding);
    const [input, setInput] = useState(
        () =>
            stagedMeterAmount(changes, row.month, row.provider, funding) ??
            String(value),
    );

    const update = (next: string) => {
        setInput(next);
        if (next.trim() === "") {
            unstage(stageKey);
            return;
        }
        const parsed = validateManualAmount(next);
        if (parsed === null) return;
        if (parsed === value) {
            unstage(stageKey);
            return;
        }
        stage(
            buildManualMeterChange({
                amount: parsed,
                funding,
                month: row.month,
                provider: row.provider,
            }),
        );
    };

    return (
        <Input
            type="number"
            min="0"
            step="0.01"
            value={input}
            onChange={(event) => update(event.target.value)}
            aria-label={`${funding} burn`}
            className="w-32"
        />
    );
}

function MeterDraftRow({
    id,
    knownProviders,
    months,
    onDiscard,
    period,
}: {
    id: string;
    knownProviders: string[];
    months: string[];
    onDiscard: (id: string) => void;
    period: string;
}) {
    const { stage, unstage } = useStaging();
    const monthOptions = useMemo(
        () => entryMonthOptions(period, months),
        [months, period],
    );
    const [month, setMonth] = useState(() =>
        defaultEntryMonth(period, monthOptions),
    );
    const [provider, setProvider] = useState("");
    const [cash, setCash] = useState("");
    const [credit, setCredit] = useState("");
    const stagedKeys = useRef<Set<string>>(new Set());

    useEffect(() => {
        setMonth((current) =>
            monthOptions.includes(current)
                ? current
                : defaultEntryMonth(period, monthOptions),
        );
    }, [monthOptions, period]);

    const sync = (
        nextMonth: string,
        nextProvider: string,
        nextCash: string,
        nextCredit: string,
    ) => {
        const slug = nextProvider.trim().toLowerCase();
        const nextKeys = new Set<string>();
        const stageAmount = (funding: MeterFunding, raw: string) => {
            if (!slug || !MONTH_RE.test(nextMonth) || raw.trim() === "") return;
            const amount = validateManualAmount(raw);
            if (amount === null) return;
            nextKeys.add(meterStageKey(nextMonth, slug, funding));
            stage(
                buildManualMeterChange({
                    amount,
                    funding,
                    month: nextMonth,
                    provider: slug,
                }),
            );
        };

        stageAmount("cash", nextCash);
        stageAmount("credit", nextCredit);
        for (const key of stagedKeys.current) {
            if (!nextKeys.has(key)) unstage(key);
        }
        stagedKeys.current = nextKeys;
    };

    const reset = () => {
        for (const key of stagedKeys.current) unstage(key);
        stagedKeys.current = new Set();
        onDiscard(id);
    };

    return (
        <TableRow>
            <TableCell>
                <Button type="button" size="sm" intent="danger" onClick={reset}>
                    Reset
                </Button>
            </TableCell>
            <TableCell>
                <select
                    value={month}
                    onChange={(event) => {
                        setMonth(event.target.value);
                        sync(event.target.value, provider, cash, credit);
                    }}
                    aria-label="month"
                    className="w-28 rounded border border-theme-border/70 bg-theme-bg px-2 py-1 text-theme-text-strong"
                >
                    {monthOptions.map((option) => (
                        <option key={option} value={option}>
                            {monthLabel(option)}
                        </option>
                    ))}
                </select>
            </TableCell>
            <TableCell>
                <Input
                    value={provider}
                    onChange={(event) => {
                        setProvider(event.target.value);
                        sync(month, event.target.value, cash, credit);
                    }}
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
            </TableCell>
            <TableCell>
                <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={cash}
                    onChange={(event) => {
                        setCash(event.target.value);
                        sync(month, provider, event.target.value, credit);
                    }}
                    placeholder="cash USD"
                    aria-label="cash burn"
                    className="w-32"
                />
            </TableCell>
            <TableCell>
                <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={credit}
                    onChange={(event) => {
                        setCredit(event.target.value);
                        sync(month, provider, cash, event.target.value);
                    }}
                    placeholder="credit USD"
                    aria-label="credit burn"
                    className="w-32"
                />
            </TableCell>
        </TableRow>
    );
}

export function MeterTab({
    committedNonce = 0,
    data,
    month = "",
    months = [],
    onMonthChange = () => {},
    provider = "all",
    providers = ["all"],
    onProviderChange = () => {},
    queuedKeys = new Set<string>(),
}: {
    data: Data;
    month?: string;
    months?: string[];
    onMonthChange?: (value: string) => void;
    provider?: string;
    providers?: string[];
    onProviderChange?: (value: string) => void;
    queuedKeys?: ReadonlySet<string>;
    committedNonce?: number;
}) {
    const { changes, resetNonce, unstage } = useStaging();
    const [editing, setEditing] = useState<Set<string>>(() =>
        stagedMeterEdits(changes),
    );
    const [drafts, setDrafts] = useState<string[]>([]);
    const lastNonce = useRef(committedNonce);
    const lastResetNonce = useRef(resetNonce);
    useEffect(() => {
        if (lastNonce.current !== committedNonce) {
            lastNonce.current = committedNonce;
            setEditing(new Set());
            setDrafts([]);
        }
    }, [committedNonce]);
    useEffect(() => {
        if (lastResetNonce.current !== resetNonce) {
            lastResetNonce.current = resetNonce;
            setEditing(new Set());
            setDrafts([]);
        }
    }, [resetNonce]);

    const stagedEdits = useMemo(() => stagedMeterEdits(changes), [changes]);
    const toggle = (row: MeterMonthlyRow, open: boolean) => {
        if (!open) {
            unstage(meterStageKey(row.month, row.provider, "cash"));
            unstage(meterStageKey(row.month, row.provider, "credit"));
        }
        const key = meterEditKey(row.month, row.provider);
        setEditing((current) => {
            const next = new Set(current);
            if (open) next.add(key);
            else next.delete(key);
            return next;
        });
    };
    const addDraft = () => setDrafts((current) => [...current, newId()]);
    const discardDraft = (id: string) =>
        setDrafts((current) => current.filter((draft) => draft !== id));
    const baseRows = useMemo(
        () =>
            sortedMeter(data.meterMonthly).filter(
                (row) =>
                    matchesMonth(row.month, month) &&
                    (provider === "all" || row.provider === provider),
            ),
        [data.meterMonthly, month, provider],
    );
    const sortColumns = useMemo<SortColumn<MeterMonthlyRow>[]>(
        () => [
            {
                key: "actions",
                value: (row) =>
                    queuedKeys.has(queuedMeterKey(row.month, row.provider)) ||
                    stagedEdits.has(meterEditKey(row.month, row.provider)),
            },
            { key: "month", value: (row) => row.month },
            { key: "provider", value: (row) => row.provider },
            { key: "cash_burn_usd", value: (row) => row.cash_burn_usd },
            { key: "credit_burn_usd", value: (row) => row.credit_burn_usd },
        ],
        [queuedKeys, stagedEdits],
    );
    const { headerProps, rows } = useSortableRows(baseRows, sortColumns);
    const knownProviders = useMemo(
        () => providers.filter((slug) => slug !== "all"),
        [providers],
    );

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
            </FilterBar>
            <TableScroller>
                <DataTable>
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell {...headerProps("actions")}>
                                actions
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("month")}>
                                month
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("provider")}>
                                provider
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("cash_burn_usd")}>
                                cash_burn
                            </TableHeaderCell>
                            <TableHeaderCell
                                {...headerProps("credit_burn_usd")}
                            >
                                credit_burn
                            </TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {withUniqueRowKeys(
                            rows,
                            (row) => `${row.month}|${row.provider}`,
                        ).map(({ key, row }) => {
                            const open = editing.has(
                                meterEditKey(row.month, row.provider),
                            );
                            const queued = queuedKeys.has(
                                queuedMeterKey(row.month, row.provider),
                            );
                            const staged = stagedEdits.has(
                                meterEditKey(row.month, row.provider),
                            );
                            return (
                                <TableRow key={key}>
                                    <TableCell>
                                        <Button
                                            size="sm"
                                            intent={open ? "danger" : "info"}
                                            onClick={() => toggle(row, !open)}
                                        >
                                            {open ? "Reset" : "Edit"}
                                        </Button>
                                    </TableCell>
                                    <TableCell>
                                        {monthName(row.month)}
                                    </TableCell>
                                    <TableCell>
                                        <span className="inline-flex items-center gap-1.5">
                                            {row.provider}
                                            {(queued || staged) && (
                                                <Chip
                                                    size="sm"
                                                    intent="warning"
                                                >
                                                    {queued
                                                        ? "queued"
                                                        : "edited"}
                                                </Chip>
                                            )}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        {open ? (
                                            <MeterAmountInput
                                                funding="cash"
                                                row={row}
                                                value={row.cash_burn_usd}
                                            />
                                        ) : (
                                            <AmountWithSource
                                                value={row.cash_burn_usd}
                                                source={row.cash_src}
                                            />
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        {open ? (
                                            <MeterAmountInput
                                                funding="credit"
                                                row={row}
                                                value={row.credit_burn_usd}
                                            />
                                        ) : (
                                            <AmountWithSource
                                                value={row.credit_burn_usd}
                                                source={row.credit_src}
                                            />
                                        )}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                        {drafts.map((id) => (
                            <MeterDraftRow
                                key={id}
                                id={id}
                                knownProviders={knownProviders}
                                months={months}
                                onDiscard={discardDraft}
                                period={month}
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
                            <TableCell />
                            <TableCell />
                        </TableRow>
                    </TableBody>
                </DataTable>
            </TableScroller>
        </div>
    );
}
