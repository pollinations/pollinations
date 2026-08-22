import {
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
} from "@pollinations/ui";
import { Fragment, useMemo, useState } from "react";
import {
    DataTable,
    GROUP_BORDER,
    HeaderHint,
    type SortColumn,
    TableScroller,
    useSortableRows,
    withUniqueRowKeys,
} from "../components/DataTable";
import { EvidenceAction, EvidencePreview } from "../components/Evidence";
import { SourceCell } from "../components/Provenance";
import type { DriveDocumentLink } from "../lib/documents";
import { fmtNumber, fmtUtcDateTime } from "../lib/format";
import {
    type MonthFilterValue,
    matchesMonth,
    matchesValue,
    monthLabel,
    type ValueFilter,
    WINDOW_START,
} from "../lib/months";
import type { Data, OpCloudRow } from "../types";

function resourceLabel(row: OpCloudRow): string {
    return (
        row.model ||
        row.resource_name ||
        row.resource_id ||
        row.resource_sku ||
        "–"
    );
}

function costTypeLabel(type: string): string {
    const normalized = type.trim().toLowerCase();
    if (normalized === "inference") return "Inference";
    if (normalized === "gpu") return "GPU";
    if (normalized === "infra") return "Infrastructure";
    if (normalized === "balance") return "Balance";
    return normalized || "Unclassified";
}

function DetailItem({ label, value }: { label: string; value: unknown }) {
    const text = String(value ?? "").trim() || "–";
    return (
        <div className="min-w-0">
            <dt className="text-xs font-medium uppercase tracking-wide text-theme-text-soft">
                {label}
            </dt>
            <dd className="break-all font-mono text-sm text-theme-text-strong">
                {text}
            </dd>
        </div>
    );
}

export function OpCloudTab({
    data,
    month = "",
    vendor = "all",
}: {
    data: Data;
    month?: MonthFilterValue;
    vendor?: ValueFilter;
}) {
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
    const [previewDocument, setPreviewDocument] =
        useState<DriveDocumentLink | null>(null);
    const baseRows = useMemo(
        () =>
            (data.opCloud ?? []).filter(
                (row) =>
                    row.start.slice(0, 7) >= WINDOW_START &&
                    matchesMonth(row.start, month) &&
                    matchesValue(row.vendor, vendor),
            ),
        [data.opCloud, month, vendor],
    );
    const sortColumns = useMemo<SortColumn<OpCloudRow>[]>(
        () => [
            { key: "start", value: (row) => row.start },
            { key: "vendor", value: (row) => row.vendor },
            { key: "type", value: (row) => costTypeLabel(row.type) },
            { key: "resource", value: resourceLabel },
            { key: "paid", value: (row) => row.paid },
            { key: "credit", value: (row) => row.credit },
            { key: "currency", value: (row) => row.currency },
            { key: "source", value: (row) => row.source },
            { key: "evidence", value: (row) => row.evidence },
        ],
        [],
    );
    const { headerProps, rows } = useSortableRows(baseRows, sortColumns, {
        key: "start",
        direction: "desc",
    });

    const toggle = (entryId: string) => {
        setExpanded((current) => {
            const next = new Set(current);
            if (next.has(entryId)) next.delete(entryId);
            else next.add(entryId);
            return next;
        });
    };

    return (
        <TableScroller>
            <DataTable>
                <TableHead>
                    <TableRow>
                        <TableHeaderCell rowSpan={2} {...headerProps("start")}>
                            Month
                        </TableHeaderCell>
                        <TableHeaderCell rowSpan={2} {...headerProps("vendor")}>
                            Vendor
                        </TableHeaderCell>
                        <TableHeaderCell rowSpan={2} {...headerProps("type")}>
                            Type
                        </TableHeaderCell>
                        <TableHeaderCell
                            rowSpan={2}
                            {...headerProps("resource")}
                        >
                            Model / resource
                        </TableHeaderCell>
                        <TableHeaderCell
                            colSpan={3}
                            align="center"
                            className={GROUP_BORDER}
                        >
                            Vendor funding
                        </TableHeaderCell>
                        <TableHeaderCell
                            colSpan={2}
                            align="center"
                            className={GROUP_BORDER}
                        >
                            Evidence
                        </TableHeaderCell>
                        <TableHeaderCell rowSpan={2}>Details</TableHeaderCell>
                    </TableRow>
                    <TableRow>
                        <TableHeaderCell
                            align="right"
                            className={GROUP_BORDER}
                            {...headerProps("paid")}
                        >
                            <HeaderHint hint="Usage rows: negative is cash-funded cost and positive is a refund. Balance rows: current cash prepaid.">
                                Paid
                            </HeaderHint>
                        </TableHeaderCell>
                        <TableHeaderCell
                            align="right"
                            {...headerProps("credit")}
                        >
                            <HeaderHint hint="Usage rows: negative is credit-funded cost and positive is a grant. Balance rows: current free credit.">
                                Credit
                            </HeaderHint>
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("currency")}>
                            Currency
                        </TableHeaderCell>
                        <TableHeaderCell
                            className={GROUP_BORDER}
                            {...headerProps("source")}
                        >
                            Source
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("evidence")}>
                            Document
                        </TableHeaderCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {withUniqueRowKeys(rows, (row) => row.entry_id).map(
                        ({ key, row }) => {
                            const isExpanded = expanded.has(key);
                            return (
                                <Fragment key={key}>
                                    <TableRow>
                                        <TableCell className="whitespace-nowrap">
                                            {monthLabel(row.start.slice(0, 7))}
                                        </TableCell>
                                        <TableCell>{row.vendor}</TableCell>
                                        <TableCell>
                                            {costTypeLabel(row.type)}
                                        </TableCell>
                                        <TableCell>
                                            {resourceLabel(row)}
                                        </TableCell>
                                        <TableCell
                                            align="right"
                                            className={GROUP_BORDER}
                                        >
                                            {fmtNumber(row.paid)}
                                        </TableCell>
                                        <TableCell align="right">
                                            {fmtNumber(row.credit)}
                                        </TableCell>
                                        <TableCell>{row.currency}</TableCell>
                                        <TableCell className={GROUP_BORDER}>
                                            <SourceCell
                                                sources={[row.source]}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <EvidenceAction
                                                evidence={row.evidence}
                                                onPreview={setPreviewDocument}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <button
                                                type="button"
                                                onClick={() => toggle(key)}
                                                className="font-medium text-theme-text underline underline-offset-4 hover:text-theme-text-soft"
                                                aria-expanded={isExpanded}
                                            >
                                                {isExpanded ? "Hide" : "Show"}
                                            </button>
                                        </TableCell>
                                    </TableRow>
                                    {isExpanded ? (
                                        <TableRow>
                                            <TableCell
                                                colSpan={10}
                                                className="bg-theme-bg-active/40"
                                            >
                                                <dl className="grid gap-4 p-2 sm:grid-cols-2 lg:grid-cols-4">
                                                    <DetailItem
                                                        label="Period"
                                                        value={`${fmtUtcDateTime(row.start)} – ${fmtUtcDateTime(row.end)}`}
                                                    />
                                                    <DetailItem
                                                        label="Recorded"
                                                        value={fmtUtcDateTime(
                                                            row.recorded_at,
                                                        )}
                                                    />
                                                    <DetailItem
                                                        label="Account"
                                                        value={row.account_name}
                                                    />
                                                    <DetailItem
                                                        label="Account ID"
                                                        value={row.account_id}
                                                    />
                                                    <DetailItem
                                                        label="Resource name"
                                                        value={
                                                            row.resource_name
                                                        }
                                                    />
                                                    <DetailItem
                                                        label="Resource ID"
                                                        value={row.resource_id}
                                                    />
                                                    <DetailItem
                                                        label="SKU"
                                                        value={row.resource_sku}
                                                    />
                                                    <DetailItem
                                                        label="Count"
                                                        value={
                                                            row.resource_count
                                                        }
                                                    />
                                                    <DetailItem
                                                        label="Entry ID"
                                                        value={row.entry_id}
                                                    />
                                                </dl>
                                            </TableCell>
                                        </TableRow>
                                    ) : null}
                                </Fragment>
                            );
                        },
                    )}
                </TableBody>
            </DataTable>
            <EvidencePreview
                documentLink={previewDocument}
                onClose={() => setPreviewDocument(null)}
            />
        </TableScroller>
    );
}
