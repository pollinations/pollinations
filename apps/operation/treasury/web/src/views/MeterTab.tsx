import {
    Button,
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
import { dirtyControlClass } from "../components/EditableCell";
import { SourceCell, uniqueSources } from "../components/Provenance";
import {
    buildManualMeterChange,
    validateManualAmount,
} from "../components/UsageEntryForm";
import { matchesMonth, monthLabel } from "../lib/months";
import { queuedMeterKey } from "../lib/queued";
import { useStaging } from "../lib/staging";
import type { Data, MeterMonthlyRow } from "../types";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const YEAR_RE = /^\d{4}$/;
type MeterFunding = "prepaid" | "credit";
type UsageBucket = "credit" | "prepaid";

type MeterUsageRow = {
    month: string;
    provider: string;
    creditUsage: number;
    prepaidUsage: number;
    creditSource: string;
    prepaidSource: string;
};

function currentMonth() {
    return new Date().toISOString().slice(0, 7);
}

function usageBucket(funding: string): UsageBucket {
    return funding === "credit" ? "credit" : "prepaid";
}

function combineSource(current: string, next: string) {
    if (!next) return current;
    if (!current) return next;
    return current === next ? current : "mixed";
}

function combineSources(...sources: string[]) {
    return uniqueSources(sources);
}

const METER_SOURCE_RANK: Record<string, number> = {
    manual: 0,
    api: 1,
    cli: 2,
    bq: 3,
};

function meterRowRank(row: MeterMonthlyRow) {
    return METER_SOURCE_RANK[row.source] ?? 99;
}

function effectiveMeterRows(rows: MeterMonthlyRow[]): MeterMonthlyRow[] {
    const byBucket = new Map<string, MeterMonthlyRow>();

    for (const row of rows) {
        const key = `${row.month}|${row.provider}|${usageBucket(row.funding)}`;
        const current = byBucket.get(key);
        if (!current || meterRowRank(row) <= meterRowRank(current)) {
            byBucket.set(key, row);
        }
    }

    return [...byBucket.values()];
}

export function aggregateMeterRows(rows: MeterMonthlyRow[]): MeterUsageRow[] {
    const byKey = new Map<string, MeterUsageRow>();

    for (const row of effectiveMeterRows(rows)) {
        const key = `${row.month}|${row.provider}`;
        const current =
            byKey.get(key) ??
            ({
                month: row.month,
                provider: row.provider,
                creditUsage: 0,
                prepaidUsage: 0,
                creditSource: "",
                prepaidSource: "",
            } satisfies MeterUsageRow);

        if (usageBucket(row.funding) === "credit") {
            current.creditUsage += row.cost_usd;
            current.creditSource = combineSource(
                current.creditSource,
                row.source,
            );
        } else {
            current.prepaidUsage += row.cost_usd;
            current.prepaidSource = combineSource(
                current.prepaidSource,
                row.source,
            );
        }
        byKey.set(key, current);
    }

    return [...byKey.values()].map((row) => ({
        ...row,
        creditUsage: Math.round(row.creditUsage * 100) / 100,
        prepaidUsage: Math.round(row.prepaidUsage * 100) / 100,
    }));
}

function sortedMeter(rows: MeterUsageRow[]) {
    return [...rows].sort(
        (a, b) =>
            b.month.localeCompare(a.month) ||
            a.provider.localeCompare(b.provider),
    );
}

function providerBackfillMonth(period: string, months: string[]) {
    return MONTH_RE.test(period)
        ? period
        : defaultEntryMonth(period, entryMonthOptions(period, months));
}

function withProviderBackfillRows({
    month,
    provider,
    providers,
    rows,
}: {
    month: string;
    provider: string;
    providers: string[];
    rows: MeterUsageRow[];
}) {
    const byKey = new Map(
        rows.map((row) => [`${row.month}|${row.provider}`, row]),
    );
    const targetProviders =
        provider === "all"
            ? providers.filter((slug) => slug !== "all")
            : [provider];

    for (const slug of targetProviders) {
        if (!slug) continue;
        const key = `${month}|${slug}`;
        if (!byKey.has(key)) {
            byKey.set(key, {
                month,
                provider: slug,
                creditUsage: 0,
                prepaidUsage: 0,
                creditSource: "",
                prepaidSource: "",
            });
        }
    }

    return [...byKey.values()];
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

function meterEditKey(month: string, provider: string, funding: string) {
    return `${month}|${provider}|${funding}`;
}

function meterStageKey(month: string, provider: string, funding: string) {
    return `meter:${provider}:${month}:${funding}`;
}

type Change = { datasource: string; key: string; row: Record<string, unknown> };

function stagedMeterEdits(changes: Change[]) {
    const set = new Set<string>();
    for (const change of changes) {
        if (change.datasource !== "meter_monthly") continue;
        const month = String(change.row.month ?? "");
        const provider = String(change.row.provider ?? "");
        const funding = String(change.row.funding ?? "");
        if (month && provider && funding) {
            set.add(meterEditKey(month, provider, funding));
        }
    }
    return set;
}

function stagedMeterAmount(
    changes: Change[],
    month: string,
    provider: string,
    funding: string,
) {
    const key = meterStageKey(month, provider, funding);
    const staged = changes.find((change) => change.key === key);
    return staged ? String(staged.row.cost_usd ?? "") : null;
}

function MeterAmountInput({
    amount,
    bucket,
    month,
    provider,
}: {
    amount: number;
    bucket: UsageBucket;
    month: string;
    provider: string;
}) {
    const { changes, stage, unstage } = useStaging();
    const stageKey = meterStageKey(month, provider, bucket);
    const stagedAmount = stagedMeterAmount(changes, month, provider, bucket);
    const input = stagedAmount ?? String(amount);
    const dirty = stagedAmount !== null;

    const update = (next: string) => {
        if (next.trim() === "") {
            unstage(stageKey);
            return;
        }
        const parsed = validateManualAmount(next);
        if (parsed === null) return;
        if (parsed === amount) {
            unstage(stageKey);
            return;
        }
        stage(
            buildManualMeterChange({
                amount: parsed,
                funding: bucket,
                month,
                provider,
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
            aria-label={`${bucket}_usage`}
            className={dirtyControlClass(dirty, "w-32")}
        />
    );
}

function MeterDraftRow({
    months,
    period,
}: {
    months: string[];
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
    const [amount, setAmount] = useState("");
    const [funding, setFunding] = useState<MeterFunding>("prepaid");
    const stagedKey = useRef<string | null>(null);

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
        nextAmount: string,
        nextFunding: MeterFunding,
    ) => {
        const slug = nextProvider.trim().toLowerCase();
        const nextKey =
            slug && MONTH_RE.test(nextMonth)
                ? meterStageKey(nextMonth, slug, nextFunding)
                : null;
        if (stagedKey.current && stagedKey.current !== nextKey) {
            unstage(stagedKey.current);
        }
        stagedKey.current = nextKey;

        if (!slug || !MONTH_RE.test(nextMonth) || nextAmount.trim() === "") {
            if (nextKey) unstage(nextKey);
            return;
        }
        const parsed = validateManualAmount(nextAmount);
        if (parsed === null) {
            if (nextKey) unstage(nextKey);
            return;
        }
        stage(
            buildManualMeterChange({
                amount: parsed,
                funding: nextFunding,
                month: nextMonth,
                provider: slug,
            }),
        );
    };

    return (
        <TableRow>
            <TableCell>
                <Input
                    value={provider}
                    onChange={(event) => {
                        setProvider(event.target.value);
                        sync(month, event.target.value, amount, funding);
                    }}
                    placeholder="provider slug"
                    aria-label="provider"
                    list="meter-entry-providers"
                    className="w-40"
                />
            </TableCell>
            <TableCell>
                <select
                    value={funding}
                    onChange={(event) => {
                        const next = event.target.value as MeterFunding;
                        setFunding(next);
                        sync(month, provider, amount, next);
                    }}
                    aria-label="funding"
                    className="w-28 rounded border border-theme-border/70 bg-theme-bg px-2 py-1 text-theme-text-strong"
                >
                    <option value="prepaid">prepaid</option>
                    <option value="credit">credit</option>
                </select>
            </TableCell>
            <TableCell>
                <select
                    value={month}
                    onChange={(event) => {
                        setMonth(event.target.value);
                        sync(event.target.value, provider, amount, funding);
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
                <SourceCell sources={["manual"]} />
            </TableCell>
            <TableCell>
                {funding === "credit" ? (
                    <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={amount}
                        onChange={(event) => {
                            setAmount(event.target.value);
                            sync(month, provider, event.target.value, funding);
                        }}
                        placeholder="amount"
                        aria-label="amount"
                        className="w-32"
                    />
                ) : (
                    "-"
                )}
            </TableCell>
            <TableCell>
                {funding === "prepaid" ? (
                    <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={amount}
                        onChange={(event) => {
                            setAmount(event.target.value);
                            sync(month, provider, event.target.value, funding);
                        }}
                        placeholder="amount"
                        aria-label="amount"
                        className="w-32"
                    />
                ) : (
                    "-"
                )}
            </TableCell>
        </TableRow>
    );
}

export function MeterTab({
    committedNonce = 0,
    data,
    month = "",
    months = [],
    provider = "all",
    providers = ["all"],
    queuedKeys = new Set<string>(),
}: {
    data: Data;
    month?: string;
    months?: string[];
    provider?: string;
    providers?: string[];
    queuedKeys?: ReadonlySet<string>;
    committedNonce?: number;
}) {
    const { changes, resetNonce } = useStaging();
    const [drafts, setDrafts] = useState<string[]>([]);
    const lastNonce = useRef(committedNonce);
    const lastResetNonce = useRef(resetNonce);
    useEffect(() => {
        if (lastNonce.current !== committedNonce) {
            lastNonce.current = committedNonce;
            setDrafts([]);
        }
    }, [committedNonce]);
    useEffect(() => {
        if (lastResetNonce.current !== resetNonce) {
            lastResetNonce.current = resetNonce;
            setDrafts([]);
        }
    }, [resetNonce]);

    const stagedEdits = useMemo(() => stagedMeterEdits(changes), [changes]);
    const addDraft = () => setDrafts((current) => [...current, newId()]);
    const baseRows = useMemo(() => {
        const periodRows = aggregateMeterRows(data.meterMonthly).filter(
            (row) =>
                matchesMonth(row.month, month) &&
                (provider === "all" || row.provider === provider),
        );
        return sortedMeter(
            withProviderBackfillRows({
                month: providerBackfillMonth(month, months),
                provider,
                providers,
                rows: periodRows,
            }),
        );
    }, [data.meterMonthly, month, months, provider, providers]);
    const sortColumns = useMemo<SortColumn<MeterUsageRow>[]>(
        () => [
            { key: "provider", value: (row) => row.provider },
            { key: "month", value: (row) => row.month },
            {
                key: "source",
                value: (row) =>
                    combineSources(row.creditSource, row.prepaidSource).join(
                        ",",
                    ),
            },
            { key: "creditUsage", value: (row) => row.creditUsage },
            { key: "prepaidUsage", value: (row) => row.prepaidUsage },
        ],
        [],
    );
    const { headerProps, rows } = useSortableRows(baseRows, sortColumns);
    const knownProviders = useMemo(
        () => providers.filter((slug) => slug !== "all"),
        [providers],
    );

    return (
        <div className="flex flex-col gap-4">
            <datalist id="meter-entry-providers">
                {knownProviders.map((slug) => (
                    <option key={slug} value={slug} />
                ))}
            </datalist>
            <div>
                <Button size="sm" intent="info" onClick={addDraft}>
                    Add
                </Button>
            </div>
            <TableScroller>
                <DataTable>
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell {...headerProps("provider")}>
                                provider
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("month")}>
                                time period
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("source")}>
                                source
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("creditUsage")}>
                                credit usage
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("prepaidUsage")}>
                                prepaid usage
                            </TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {withUniqueRowKeys(
                            rows,
                            (row) => `${row.month}|${row.provider}`,
                        ).map(({ key, row }) => {
                            const creditEditKey = meterEditKey(
                                row.month,
                                row.provider,
                                "credit",
                            );
                            const prepaidEditKey = meterEditKey(
                                row.month,
                                row.provider,
                                "prepaid",
                            );
                            const queued = queuedKeys.has(
                                queuedMeterKey(row.month, row.provider),
                            );
                            const staged =
                                stagedEdits.has(creditEditKey) ||
                                stagedEdits.has(prepaidEditKey);
                            const sources = combineSources(
                                row.creditSource,
                                row.prepaidSource,
                                queued || staged ? "manual" : "",
                            );
                            return (
                                <TableRow key={key}>
                                    <TableCell>{row.provider}</TableCell>
                                    <TableCell>{row.month}</TableCell>
                                    <TableCell>
                                        <SourceCell sources={sources} />
                                    </TableCell>
                                    <TableCell>
                                        <MeterAmountInput
                                            amount={row.creditUsage}
                                            bucket="credit"
                                            month={row.month}
                                            provider={row.provider}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <MeterAmountInput
                                            amount={row.prepaidUsage}
                                            bucket="prepaid"
                                            month={row.month}
                                            provider={row.provider}
                                        />
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                        {drafts.map((id) => (
                            <MeterDraftRow
                                key={id}
                                months={months}
                                period={month}
                            />
                        ))}
                    </TableBody>
                </DataTable>
            </TableScroller>
        </div>
    );
}
