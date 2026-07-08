import {
    Alert,
    Chip,
    cn,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
    Text,
} from "@pollinations/ui";
import { useMemo } from "react";
import {
    DataTable,
    GROUP_BORDER,
    HeaderHint,
    TableScroller,
    useSortableRows,
    withUniqueRowKeys,
} from "../components/DataTable";
import { fmtNumber, fmtPct, fmtUsd, fmtUsd4 } from "../lib/format";
import {
    fleetRunRate,
    type GpuDeploymentRow,
    gpuEconomics,
    runwayChips,
} from "../lib/gpu";
import type { Data } from "../types";

export function visibleGpuRows({
    rows,
    vendor,
}: {
    rows: GpuDeploymentRow[];
    vendor: string;
}): GpuDeploymentRow[] {
    const filtered =
        vendor === "all" ? rows : rows.filter((r) => r.vendor === vendor);

    // coverage asc nulls-last (worst boxes first)
    return [...filtered].sort((a, b) => {
        const ac = a.coverage;
        const bc = b.coverage;
        if (ac === null && bc === null) return 0;
        if (ac === null) return 1;
        if (bc === null) return -1;
        return ac - bc;
    });
}

function coverageTone(value: number | null): string {
    if (value == null) return "";
    if (value < 1) return "text-intent-danger-text";
    return "";
}

function verdictChip(verdict: GpuDeploymentRow["verdict"]) {
    if (!verdict) return null;
    if (verdict === "keep") {
        return (
            <Chip intent="neutral" size="sm">
                keep
            </Chip>
        );
    }
    if (verdict === "raise?") {
        return (
            <Chip intent="warning" size="sm">
                raise?
            </Chip>
        );
    }
    // idle-candidate
    const title = "consider modal (serverless, $0 idle)";
    return (
        <Chip intent="danger" size="sm" title={title}>
            idle-candidate
        </Chip>
    );
}

export function GpuTab({
    data,
    month = "",
    vendor = "all",
}: {
    data: Data;
    month?: string;
    vendor?: string;
}) {
    const now = useMemo(() => new Date(), []);
    const runRate = useMemo(() => fleetRunRate(data), [data]);
    const runway = useMemo(() => runwayChips(data, now), [data, now]);
    const allRows = useMemo(() => gpuEconomics(data, month), [data, month]);
    const rows = useMemo(
        () => visibleGpuRows({ rows: allRows, vendor }),
        [allRows, vendor],
    );

    const sortColumns = useMemo(
        () => [
            { key: "group", value: (r: GpuDeploymentRow) => r.group },
            { key: "vendor", value: (r: GpuDeploymentRow) => r.vendor },
            {
                key: "rentUsd",
                value: (r: GpuDeploymentRow) => r.rentUsd,
            },
            { key: "requests", value: (r: GpuDeploymentRow) => r.requests },
            { key: "paidUsd", value: (r: GpuDeploymentRow) => r.paidUsd },
            { key: "questUsd", value: (r: GpuDeploymentRow) => r.questUsd },
            { key: "coverage", value: (r: GpuDeploymentRow) => r.coverage },
            {
                key: "effUsdPerReq",
                value: (r: GpuDeploymentRow) => r.effUsdPerReq,
            },
            { key: "verdict", value: (r: GpuDeploymentRow) => r.verdict },
        ],
        [],
    );

    const { headerProps, rows: sorted } = useSortableRows(rows, sortColumns);

    const latestSnapshotDate = useMemo(() => {
        const times = data.gpuFleet.map((r) => r.recorded_at);
        if (times.length === 0) return null;
        return times.reduce((a, b) => (a > b ? a : b));
    }, [data.gpuFleet]);

    if (allRows.length === 0 && data.gpuFleet.length === 0) {
        return (
            <Alert intent="warning">
                No fleet snapshots yet — run{" "}
                <code>python3 -m ingest.run --only fleet</code>
            </Alert>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            {/* header strip */}
            <div className="flex flex-wrap items-center gap-3">
                {runRate ? (
                    <Text size="sm" tone="soft">
                        fleet run-rate{" "}
                        <strong>{fmtUsd(runRate.usdPerHr)}/hr</strong> ≈{" "}
                        <strong>{fmtUsd(runRate.usdPerMonth)}/mo</strong>
                        {latestSnapshotDate && (
                            <>
                                {" "}
                                · latest snapshot{" "}
                                {latestSnapshotDate.slice(0, 10)}
                            </>
                        )}
                    </Text>
                ) : null}
                {runway.map((chip) => (
                    <Chip
                        key={chip.vendor}
                        intent={chip.tone}
                        size="sm"
                        title={`${chip.vendor}: ${chip.label}${chip.days != null ? ` · ~${chip.days.toFixed(1)}d` : ""}`}
                    >
                        {chip.vendor} {chip.label}
                        {chip.days != null && ` · ~${chip.days.toFixed(1)}d`}
                    </Chip>
                ))}
            </div>

            <TableScroller>
                <DataTable>
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell {...headerProps("group")}>
                                deployment
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("vendor")}>
                                vendor
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                className={GROUP_BORDER}
                                {...headerProps("rentUsd")}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "vendor's witnessed monthly bill (provider plane, credit+paid → USD) × this deployment's share of fleet $/hr that month. Sums to the bill — never imputed.",
                                    }}
                                >
                                    rent $
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("requests")}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "successful, non-cached generations (pollen requests)",
                                    }}
                                >
                                    req
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                className={GROUP_BORDER}
                                {...headerProps("paidUsd")}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "pollen paid by users on this deployment's models (pack meter) — gross, before ecosystem shares. Source: pollen plane.",
                                    }}
                                >
                                    paid ℗
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("questUsd")}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "free usage occupying the box — earns $0",
                                    }}
                                >
                                    quest ℗
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                className={GROUP_BORDER}
                                {...headerProps("coverage")}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "retained paid pollen × net ratio ÷ rent — does money in pay this box's rent",
                                        formula: "retained × netRatio ÷ rent",
                                    }}
                                >
                                    coverage
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                {...headerProps("effUsdPerReq")}
                            >
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "rent ÷ requests served — the true unit cost",
                                        formula: "rent ÷ requests",
                                    }}
                                >
                                    eff $/req
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell className={GROUP_BORDER}>
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "volume of paid generations needed for this deployment to cover its rent at current registry prices",
                                        formula:
                                            "rent ÷ (registry price × netRatio)",
                                    }}
                                >
                                    break-even
                                </HeaderHint>
                            </TableHeaderCell>
                            <TableHeaderCell {...headerProps("verdict")}>
                                <HeaderHint
                                    hint={{
                                        meaning:
                                            "keep = covered · raise? = below break-even · idle-candidate = severely undercovered GPU (consider switching to serverless)",
                                    }}
                                >
                                    verdict
                                </HeaderHint>
                            </TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {withUniqueRowKeys(
                            sorted,
                            (r) => `${r.vendor}|${r.group}|${r.month}`,
                        ).map(({ key, row }) => (
                            <TableRow key={key}>
                                <TableCell>
                                    <div className="flex flex-col gap-0.5">
                                        <div className="flex items-center gap-1.5">
                                            <span>{row.group}</span>
                                            {row.kind === "serverless" && (
                                                <Chip
                                                    intent="neutral"
                                                    size="sm"
                                                    data-theme="neutral"
                                                >
                                                    serverless
                                                </Chip>
                                            )}
                                        </div>
                                        {row.models.length > 0 && (
                                            <Text size="micro" tone="soft">
                                                {row.models.join(", ")}
                                            </Text>
                                        )}
                                        {row.flags.length > 0 && (
                                            <div className="flex flex-wrap gap-1 pt-0.5">
                                                {row.flags.map((flag) => (
                                                    <Chip
                                                        key={flag}
                                                        intent="warning"
                                                        size="sm"
                                                    >
                                                        ⚠ {flag}
                                                    </Chip>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </TableCell>
                                <TableCell>{row.vendor}</TableCell>
                                <TableCell
                                    align="right"
                                    className={GROUP_BORDER}
                                >
                                    {row.rentUsd == null
                                        ? "–"
                                        : fmtUsd(row.rentUsd)}
                                </TableCell>
                                <TableCell align="right">
                                    {fmtNumber(row.requests)}
                                </TableCell>
                                <TableCell
                                    align="right"
                                    className={cn(
                                        "text-intent-success-text",
                                        GROUP_BORDER,
                                    )}
                                >
                                    {fmtUsd(row.paidUsd)}
                                </TableCell>
                                <TableCell
                                    align="right"
                                    className="text-intent-warning-text"
                                >
                                    {fmtUsd(row.questUsd)}
                                </TableCell>
                                <TableCell
                                    align="right"
                                    className={cn(
                                        coverageTone(row.coverage),
                                        GROUP_BORDER,
                                    )}
                                >
                                    {row.coverage == null
                                        ? "–"
                                        : fmtPct(row.coverage)}
                                </TableCell>
                                <TableCell align="right">
                                    {row.effUsdPerReq == null
                                        ? "–"
                                        : fmtUsd4(row.effUsdPerReq)}
                                </TableCell>
                                <TableCell className={GROUP_BORDER}>
                                    {row.breakEven.length === 0 ? (
                                        <span className="text-theme-text-soft">
                                            –
                                        </span>
                                    ) : (
                                        <div className="flex flex-col gap-0.5">
                                            {row.breakEven.map((be) => (
                                                <span key={be.model}>
                                                    {fmtNumber(be.volume)}{" "}
                                                    {be.unit}/mo
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </TableCell>
                                <TableCell>
                                    {verdictChip(row.verdict)}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </DataTable>
            </TableScroller>
        </div>
    );
}
