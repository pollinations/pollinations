import {
    CardIcon,
    ScrollArea,
    SproutIcon,
    TableBody,
    TableCell,
    TableDisclosureButton,
    TableHead,
    TableHeaderCell,
    TableRow,
} from "@pollinations/ui";
import { Fragment, useMemo, useState } from "react";
import {
    DataTable,
    HeaderHint,
    type SortColumn,
    TableScroller,
    useSortableRows,
    withUniqueRowKeys,
} from "../components/DataTable";
import { Gauge, gaugeParts } from "../components/EconomicsGauge";
import { useAmountDisplay } from "../components/ReconcilePro";
import { PairedStatCards } from "../components/StatCards";
import { fmtNumber, hasVisibleAmount } from "../lib/format";
import {
    type GpuResourceRow,
    type GpuWorkloadRow,
    gpuResourceRows,
    gpuResourceSummary,
    gpuWorkloadRows,
    gpuWorkloadSummary,
    visibleGpuResourceRows,
} from "../lib/gpu";
import type { MonthFilterValue, ValueFilter } from "../lib/months";
import { signedToneOrSoft } from "../lib/tone";
import type { Data } from "../types";

const RESOURCE_SORT_COLUMNS: readonly SortColumn<GpuResourceRow>[] = [
    { key: "resource", value: (row) => row.resourceName },
    { key: "vendor", value: (row) => row.vendor },
    { key: "gpuHours", value: (row) => row.gpuHours },
    { key: "storageHours", value: (row) => row.storageHours },
    { key: "networkGb", value: (row) => row.networkGb },
    { key: "paidCostUsd", value: (row) => row.paidCostUsd },
    { key: "creditCostUsd", value: (row) => row.creditCostUsd },
    { key: "totalCostUsd", value: (row) => row.totalCostUsd },
    { key: "costPerGpuHour", value: (row) => row.costPerGpuHour },
];

function GpuInstanceTable({ rows }: { rows: GpuResourceRow[] }) {
    const { pro, fmtUsd, fmtRateUsd, fmtNumber } = useAmountDisplay();
    const { headerProps, rows: sorted } = useSortableRows(
        rows.filter(
            (row) =>
                pro ||
                hasVisibleAmount([
                    row.paidCostUsd,
                    row.creditCostUsd,
                    row.totalCostUsd,
                ]),
        ),
        RESOURCE_SORT_COLUMNS,
        { key: "totalCostUsd", direction: "desc" },
    );

    return (
        <ScrollArea axis="x" className="p-2 pb-3">
            <DataTable className="min-w-[980px] text-sm">
                <TableHead>
                    <TableRow>
                        <TableHeaderCell
                            rowSpan={2}
                            {...headerProps("resource")}
                        >
                            GPU
                        </TableHeaderCell>
                        <TableHeaderCell rowSpan={2} {...headerProps("vendor")}>
                            Vendor
                        </TableHeaderCell>
                        <TableHeaderCell colSpan={3} align="center">
                            Usage
                        </TableHeaderCell>
                        <TableHeaderCell colSpan={3} align="center">
                            Cost
                        </TableHeaderCell>
                        <TableHeaderCell
                            rowSpan={2}
                            align="right"
                            {...headerProps("costPerGpuHour")}
                        >
                            <HeaderHint
                                hint={{
                                    meaning:
                                        "All costs attached to this GPU divided by its billed GPU hours.",
                                    formula:
                                        "(cash + consumed credit) ÷ GPU hours",
                                }}
                            >
                                $ / GPU h
                            </HeaderHint>
                        </TableHeaderCell>
                    </TableRow>
                    <TableRow>
                        <TableHeaderCell
                            align="right"
                            {...headerProps("gpuHours")}
                        >
                            GPU h
                        </TableHeaderCell>
                        <TableHeaderCell
                            align="right"
                            {...headerProps("storageHours")}
                        >
                            Storage h
                        </TableHeaderCell>
                        <TableHeaderCell
                            align="right"
                            {...headerProps("networkGb")}
                        >
                            Network GB
                        </TableHeaderCell>
                        <TableHeaderCell
                            align="right"
                            {...headerProps("paidCostUsd")}
                        >
                            Cash
                        </TableHeaderCell>
                        <TableHeaderCell
                            align="right"
                            {...headerProps("creditCostUsd")}
                        >
                            Credit
                        </TableHeaderCell>
                        <TableHeaderCell
                            align="right"
                            {...headerProps("totalCostUsd")}
                        >
                            Total
                        </TableHeaderCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {withUniqueRowKeys(
                        sorted,
                        (row) => `${row.vendor}|${row.kind}|${row.resourceId}`,
                    ).map(({ key, row }) => (
                        <TableRow key={key}>
                            <TableCell>
                                <span className="block font-medium">
                                    {row.resourceName}
                                </span>
                                {row.kind === "overhead" ? (
                                    <span className="block text-xs text-theme-text-muted">
                                        {fmtNumber(row.relatedResources)} source
                                        {row.relatedResources === 1 ? "" : "s"}
                                    </span>
                                ) : (
                                    <>
                                        {!row.resourceName.includes(
                                            row.resourceId,
                                        ) &&
                                            row.resourceId && (
                                                <span className="block text-xs text-theme-text-muted">
                                                    {row.resourceId}
                                                </span>
                                            )}
                                        {row.hardware && (
                                            <span className="block text-xs text-theme-text-muted">
                                                {row.hardware}
                                            </span>
                                        )}
                                    </>
                                )}
                            </TableCell>
                            <TableCell>{row.vendor}</TableCell>
                            <TableCell align="right" numeric>
                                {fmtNumber(row.gpuHours)}
                            </TableCell>
                            <TableCell align="right" numeric>
                                {fmtNumber(row.storageHours)}
                            </TableCell>
                            <TableCell align="right" numeric>
                                {fmtNumber(row.networkGb)}
                            </TableCell>
                            <TableCell align="right" numeric>
                                {fmtUsd(row.paidCostUsd)}
                            </TableCell>
                            <TableCell align="right" numeric>
                                {fmtUsd(row.creditCostUsd)}
                            </TableCell>
                            <TableCell align="right" numeric>
                                {fmtUsd(row.totalCostUsd)}
                            </TableCell>
                            <TableCell align="right" numeric>
                                {fmtRateUsd(row.costPerGpuHour)}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </DataTable>
        </ScrollArea>
    );
}

export function GpuTab({
    data,
    month = "",
    vendor = "all",
}: {
    data: Data;
    month?: MonthFilterValue;
    vendor?: ValueFilter;
}) {
    const { pro, fmtUsd, fmtSignedUsd, fmtMarginPct, fmtUnsignedPct } =
        useAmountDisplay();
    const resourceRows = useMemo(
        () => visibleGpuResourceRows(gpuResourceRows(data, month), vendor),
        [data, month, vendor],
    );
    const rows = useMemo(
        () => gpuWorkloadRows(data, month, vendor),
        [data, month, vendor],
    );
    const stats = useMemo(() => gpuWorkloadSummary(rows), [rows]);
    const resourceStats = useMemo(
        () => gpuResourceSummary(resourceRows),
        [resourceRows],
    );
    const usageSplit = gaugeParts(stats.paidUsd, stats.questUsd);
    const fundingSplit = gaugeParts(stats.paidCostUsd, stats.creditCostUsd);
    const percent = (value: number | undefined) => fmtUnsignedPct(value);
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
    const sortColumns = useMemo<SortColumn<GpuWorkloadRow>[]>(
        () => [
            { key: "workload", value: (row) => row.workload },
            { key: "vendors", value: (row) => row.vendors },
            { key: "gpuCount", value: (row) => row.gpuCount },
            { key: "retainedUsd", value: (row) => row.retainedUsd },
            { key: "questUsd", value: (row) => row.questUsd },
            { key: "paidCostUsd", value: (row) => row.paidCostUsd },
            { key: "creditCostUsd", value: (row) => row.creditCostUsd },
            { key: "totalCostUsd", value: (row) => row.totalCostUsd },
            { key: "currentResultUsd", value: (row) => row.currentResultUsd },
            {
                key: "currentPerformancePct",
                value: (row) => row.currentPerformancePct,
            },
            {
                key: "fullCostResultUsd",
                value: (row) => row.fullCostResultUsd,
            },
            {
                key: "fullCostPerformancePct",
                value: (row) => row.fullCostPerformancePct,
            },
        ],
        [],
    );
    const { headerProps, rows: sorted } = useSortableRows(
        rows.filter(
            (row) =>
                pro ||
                hasVisibleAmount([
                    ...(row.kind === "overhead"
                        ? []
                        : [row.paidUsd, row.retainedUsd, row.questUsd]),
                    row.paidCostUsd,
                    row.creditCostUsd,
                    row.totalCostUsd,
                    row.currentResultUsd,
                    row.fullCostResultUsd,
                ]),
        ),
        sortColumns,
        {
            key: "fullCostResultUsd",
            direction: "asc",
        },
    );
    const toggle = (key: string) => {
        setExpanded((current) => {
            const next = new Set(current);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const pollenTotal = fmtUsd(stats.paidUsd + stats.questUsd);
    const costTotal = fmtUsd(resourceStats.totalCostUsd);

    return (
        <div className="flex flex-col gap-4">
            <PairedStatCards
                layout="rows"
                cards={[
                    {
                        label: "Pollen used",
                        total: rows.length
                            ? pollenTotal && `${pollenTotal} total`
                            : "No data",
                        items: [
                            {
                                label: (
                                    <span className="inline-flex items-center gap-1.5 text-paid-deep">
                                        <CardIcon className="h-3.5 w-3.5" />
                                        Paid
                                    </span>
                                ),
                                value: fmtUsd(
                                    rows.length ? stats.paidUsd : null,
                                ),
                                valueClassName: "polli:text-paid-deep",
                                detail: percent(usageSplit?.leftPct),
                            },
                            {
                                label: (
                                    <span className="inline-flex items-center gap-1.5 text-tier-deep">
                                        <SproutIcon className="h-3.5 w-3.5" />
                                        Quest
                                    </span>
                                ),
                                value: fmtUsd(
                                    rows.length ? stats.questUsd : null,
                                ),
                                valueClassName: "polli:text-tier-deep",
                                detail: percent(
                                    usageSplit
                                        ? 100 - Math.round(usageSplit.leftPct)
                                        : undefined,
                                ),
                            },
                        ],
                        detail: (
                            <Gauge
                                className="mt-4 w-full"
                                left={stats.paidUsd}
                                leftLabel="Paid"
                                right={stats.questUsd}
                                rightLabel="Quest"
                            />
                        ),
                    },
                    {
                        label: "GPU costs",
                        total: resourceRows.length
                            ? costTotal && `${costTotal} total`
                            : "No recorded costs",
                        items: [
                            {
                                label: "Cash",
                                value: fmtUsd(
                                    resourceRows.length
                                        ? stats.paidCostUsd
                                        : null,
                                ),
                                detail: percent(fundingSplit?.leftPct),
                            },
                            {
                                label: "Credits",
                                value: fmtUsd(
                                    resourceRows.length
                                        ? stats.creditCostUsd
                                        : null,
                                ),
                                detail: percent(
                                    fundingSplit
                                        ? 100 - Math.round(fundingSplit.leftPct)
                                        : undefined,
                                ),
                            },
                        ],
                        detail: (
                            <Gauge
                                className="mt-4 w-full"
                                palette="neutral"
                                left={stats.paidCostUsd}
                                leftLabel="Cash"
                                right={stats.creditCostUsd}
                                rightLabel="Credits"
                            />
                        ),
                    },
                    {
                        label: "Result",
                        items: [
                            {
                                label: "With credits",
                                value:
                                    stats.currentResultUsd == null
                                        ? "Unknown"
                                        : fmtSignedUsd(stats.currentResultUsd),
                                valueClassName:
                                    stats.currentResultUsd == null
                                        ? undefined
                                        : signedToneOrSoft(
                                              stats.currentResultUsd,
                                          ),
                            },
                            {
                                label: "Without credits",
                                value:
                                    stats.fullCostResultUsd == null
                                        ? "Unknown"
                                        : fmtSignedUsd(stats.fullCostResultUsd),
                                valueClassName:
                                    stats.fullCostResultUsd == null
                                        ? undefined
                                        : signedToneOrSoft(
                                              stats.fullCostResultUsd,
                                          ),
                            },
                        ],
                    },
                ]}
            />
            <TableScroller>
                <DataTable className="min-w-[1360px]">
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell
                                rowSpan={2}
                                {...headerProps("workload")}
                            >
                                Workload
                            </TableHeaderCell>
                            <TableHeaderCell
                                rowSpan={2}
                                {...headerProps("vendors")}
                            >
                                Vendors
                            </TableHeaderCell>
                            <TableHeaderCell
                                rowSpan={2}
                                align="right"
                                {...headerProps("gpuCount")}
                            >
                                GPUs
                            </TableHeaderCell>
                            <TableHeaderCell colSpan={2} align="center">
                                Pollen
                            </TableHeaderCell>
                            <TableHeaderCell colSpan={3} align="center">
                                Cost
                            </TableHeaderCell>
                            <TableHeaderCell colSpan={2} align="center">
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "Actual cash outcome while consumed vendor credits cover part of GPU usage.",
                                        formula: "retained − cash",
                                    }}
                                >
                                    Current · with credits
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell colSpan={2} align="center">
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "Underlying GPU outcome after valuing consumed vendor credits as costs that may later require cash.",
                                        formula:
                                            "retained − cash − consumed credit",
                                    }}
                                >
                                    Full cost · without credits
                                </HeaderHint>
                            </TableHeaderCell>
                        </TableRow>
                        <TableRow>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("retainedUsd")}
                            >
                                <span className="inline-flex items-center gap-1.5 text-paid-deep">
                                    <CardIcon className="h-3.5 w-3.5" />
                                    Retained
                                </span>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("questUsd")}
                            >
                                <span className="inline-flex items-center gap-1.5 text-tier-deep">
                                    <SproutIcon className="h-3.5 w-3.5" />
                                    Quest
                                </span>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("paidCostUsd")}
                            >
                                Cash
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("creditCostUsd")}
                            >
                                Credit
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("totalCostUsd")}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "Full resource cost before vendor credits reduce the cash bill.",
                                        formula: "cash + consumed credit",
                                    }}
                                >
                                    Total
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("currentResultUsd")}
                            >
                                Result
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("currentPerformancePct")}
                            >
                                Performance
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("fullCostResultUsd")}
                            >
                                Result
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("fullCostPerformancePct")}
                            >
                                Performance
                            </TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {withUniqueRowKeys(sorted, (row) => row.key).map(
                            ({ key, row }) => {
                                const isExpanded = expanded.has(row.key);
                                return (
                                    <Fragment key={key}>
                                        <TableRow className="font-semibold">
                                            <TableCell>
                                                <TableDisclosureButton
                                                    expanded={isExpanded}
                                                    disabled={
                                                        row.resources.length ===
                                                        0
                                                    }
                                                    onClick={() =>
                                                        toggle(row.key)
                                                    }
                                                >
                                                    {row.workload}
                                                </TableDisclosureButton>
                                            </TableCell>
                                            <TableCell>{row.vendors}</TableCell>
                                            <TableCell align="right" numeric>
                                                {fmtNumber(row.gpuCount)}
                                            </TableCell>
                                            <TableCell align="right" numeric>
                                                {fmtUsd(row.retainedUsd)}
                                            </TableCell>
                                            <TableCell align="right" numeric>
                                                {fmtUsd(row.questUsd)}
                                            </TableCell>
                                            <TableCell align="right" numeric>
                                                {fmtUsd(
                                                    row.resources.length
                                                        ? row.paidCostUsd
                                                        : null,
                                                )}
                                            </TableCell>
                                            <TableCell align="right" numeric>
                                                {fmtUsd(
                                                    row.resources.length
                                                        ? row.creditCostUsd
                                                        : null,
                                                )}
                                            </TableCell>
                                            <TableCell align="right" numeric>
                                                {fmtUsd(
                                                    row.resources.length
                                                        ? row.totalCostUsd
                                                        : null,
                                                )}
                                            </TableCell>
                                            <TableCell
                                                align="right"
                                                numeric
                                                className={signedToneOrSoft(
                                                    row.currentResultUsd,
                                                )}
                                            >
                                                {fmtSignedUsd(
                                                    row.currentResultUsd,
                                                )}
                                            </TableCell>
                                            <TableCell
                                                align="right"
                                                numeric
                                                className={signedToneOrSoft(
                                                    row.currentPerformancePct,
                                                )}
                                            >
                                                {fmtMarginPct(
                                                    row.currentPerformancePct,
                                                )}
                                            </TableCell>
                                            <TableCell
                                                align="right"
                                                numeric
                                                className={signedToneOrSoft(
                                                    row.fullCostResultUsd,
                                                )}
                                            >
                                                {fmtSignedUsd(
                                                    row.fullCostResultUsd,
                                                )}
                                            </TableCell>
                                            <TableCell
                                                align="right"
                                                numeric
                                                className={signedToneOrSoft(
                                                    row.fullCostPerformancePct,
                                                )}
                                            >
                                                {fmtMarginPct(
                                                    row.fullCostPerformancePct,
                                                )}
                                            </TableCell>
                                        </TableRow>
                                        {isExpanded &&
                                            row.resources.length > 0 && (
                                                <TableRow>
                                                    <TableCell
                                                        colSpan={12}
                                                        className="pl-6"
                                                    >
                                                        <GpuInstanceTable
                                                            rows={row.resources}
                                                        />
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                    </Fragment>
                                );
                            },
                        )}
                        {sorted.length === 0 && (
                            <TableRow>
                                <TableCell
                                    colSpan={12}
                                    className="py-8 text-center text-theme-text-soft"
                                >
                                    No GPU workloads for this selection.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </DataTable>
            </TableScroller>
        </div>
    );
}
