import {
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
    type SortColumn,
    TableScroller,
    useSortableRows,
    withUniqueRowKeys,
} from "../components/DataTable";
import { EvidenceAction, EvidencePreview } from "../components/Evidence";
import { SourceCell } from "../components/Provenance";
import { useAmountDisplay } from "../components/ReconcilePro";
import type { DriveDocumentLink } from "../lib/documents";
import { fmtMonthDay, fmtUtcDateTime } from "../lib/format";
import {
    type MonthFilterValue,
    matchesMonth,
    matchesValue,
    type ValueFilter,
    WINDOW_START,
} from "../lib/months";
import {
    resolveProvider,
    resolveProviderAccount,
} from "../lib/providerRegistry";
import type { Data, VendorLedgerRow } from "../types";

function resourceLabel(row: VendorLedgerRow): string {
    return (
        row.model ||
        row.resource_name ||
        row.resource_id ||
        row.resource_sku ||
        "–"
    );
}

function accountLabel(row: VendorLedgerRow): string {
    const provider = resolveProvider(row.vendor);
    return (
        (provider && resolveProviderAccount(provider, row.account_id)?.label) ||
        row.account_name ||
        row.account_id ||
        "Unassigned"
    );
}

function costTypeLabel(type: string): string {
    const normalized = type.trim().toLowerCase();
    if (normalized === "inference") return "Inference";
    if (normalized === "gpu") return "GPU";
    if (normalized === "infra") return "Infrastructure";
    if (normalized === "balance") return "Balance";
    if (normalized === "planned") return "Planned cash · non-posting";
    if (normalized === "statement") return "Source total · non-posting";
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

export function VendorLedgerTab({
    data,
    month = "",
    vendor = "all",
}: {
    data: Data;
    month?: MonthFilterValue;
    vendor?: ValueFilter;
}) {
    const { fmtNumber } = useAmountDisplay();
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
    const [previewDocument, setPreviewDocument] =
        useState<DriveDocumentLink | null>(null);
    const baseRows = useMemo(
        () =>
            [
                ...(data.vendorLedger ?? []),
                ...(data.vendorStatements ?? []),
                ...(data.vendorPlans ?? []),
            ].filter(
                (row) =>
                    (row.type === "planned" ||
                        row.start.slice(0, 7) >= WINDOW_START) &&
                    (row.type === "planned"
                        ? (typeof month === "string" ? [month] : month).some(
                              (selected) =>
                                  !selected ||
                                  ((!row.start ||
                                      row.start <=
                                          (selected.length === 4
                                              ? `${selected}-12`
                                              : selected)) &&
                                      (!row.end ||
                                          row.end >=
                                              (selected.length === 4
                                                  ? `${selected}-01`
                                                  : selected))),
                          ) ||
                          (Array.isArray(month) && month.length === 0)
                        : matchesMonth(row.start, month) ||
                          (!!row.comparison_month &&
                              matchesMonth(row.comparison_month, month))) &&
                    matchesValue(row.vendor, vendor),
            ),
        [
            data.vendorLedger,
            data.vendorStatements,
            data.vendorPlans,
            month,
            vendor,
        ],
    );
    const sortColumns = useMemo<SortColumn<VendorLedgerRow>[]>(
        () => [
            { key: "start", value: (row) => row.start },
            { key: "vendor", value: (row) => row.vendor },
            { key: "account", value: accountLabel },
            { key: "type", value: (row) => costTypeLabel(row.type) },
            { key: "resource", value: resourceLabel },
            { key: "paid", value: (row) => row.paid },
            { key: "credit", value: (row) => row.credit },
            {
                key: "statement_amount",
                value: (row) => row.plan_amount ?? row.statement_amount ?? null,
            },
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
                        <TableHeaderCell rowSpan={2} {...headerProps("vendor")}>
                            Vendor
                        </TableHeaderCell>
                        <TableHeaderCell
                            rowSpan={2}
                            {...headerProps("account")}
                        >
                            Account
                        </TableHeaderCell>
                        <TableHeaderCell rowSpan={2} {...headerProps("start")}>
                            Coverage
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
                        <TableHeaderCell colSpan={4} align="center">
                            Recorded amounts
                        </TableHeaderCell>
                        <TableHeaderCell colSpan={2} align="center">
                            Evidence
                        </TableHeaderCell>
                        <TableHeaderCell rowSpan={2}>Details</TableHeaderCell>
                    </TableRow>
                    <TableRow>
                        <TableHeaderCell align="right" {...headerProps("paid")}>
                            Paid
                        </TableHeaderCell>
                        <TableHeaderCell
                            align="right"
                            {...headerProps("credit")}
                        >
                            Credit
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("currency")}>
                            Currency
                        </TableHeaderCell>
                        <TableHeaderCell
                            align="right"
                            {...headerProps("statement_amount")}
                        >
                            Source / planned amount
                        </TableHeaderCell>
                        <TableHeaderCell {...headerProps("source")}>
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
                                        <TableCell>
                                            {resolveProvider(row.vendor)
                                                ?.label ?? row.vendor}
                                        </TableCell>
                                        <TableCell>
                                            {accountLabel(row)}
                                        </TableCell>
                                        <TableCell className="whitespace-nowrap text-xs">
                                            <span>
                                                {row.type === "planned"
                                                    ? row.start ||
                                                      "Forecast start"
                                                    : fmtMonthDay(row.start)}
                                                {row.end
                                                    ? ` – ${row.type === "planned" ? row.end : fmtMonthDay(row.end)}${row.end.slice(0, 4) !== row.start.slice(0, 4) ? `, ${row.end.slice(0, 4)}` : ""}`
                                                    : ""}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            {costTypeLabel(row.type)}
                                        </TableCell>
                                        <TableCell>
                                            {resourceLabel(row)}
                                        </TableCell>
                                        <TableCell align="right">
                                            {["statement", "planned"].includes(
                                                row.type,
                                            )
                                                ? "–"
                                                : fmtNumber(row.paid)}
                                        </TableCell>
                                        <TableCell align="right">
                                            {["statement", "planned"].includes(
                                                row.type,
                                            )
                                                ? "–"
                                                : fmtNumber(row.credit)}
                                        </TableCell>
                                        <TableCell>{row.currency}</TableCell>
                                        <TableCell align="right">
                                            {(row.plan_amount ??
                                                row.statement_amount) == null
                                                ? "–"
                                                : fmtNumber(
                                                      (row.plan_amount ??
                                                          row.statement_amount) as number,
                                                  )}
                                        </TableCell>
                                        <TableCell>
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
                                            <TableDisclosureButton
                                                expanded={isExpanded}
                                                onClick={() => toggle(key)}
                                            >
                                                Details
                                            </TableDisclosureButton>
                                        </TableCell>
                                    </TableRow>
                                    {isExpanded ? (
                                        <TableRow>
                                            <TableCell
                                                colSpan={12}
                                                className="pl-6"
                                            >
                                                <dl className="grid gap-4 p-2 sm:grid-cols-2 lg:grid-cols-4">
                                                    {row.type === "planned" ? (
                                                        <>
                                                            <DetailItem
                                                                label="Cadence"
                                                                value={
                                                                    row.plan_cadence
                                                                }
                                                            />
                                                            <DetailItem
                                                                label="Category"
                                                                value={
                                                                    row.plan_category
                                                                }
                                                            />
                                                            <DetailItem
                                                                label="Settled Bank entries"
                                                                value={row.settled_by_entry_ids?.join(
                                                                    ", ",
                                                                )}
                                                            />
                                                        </>
                                                    ) : null}
                                                    <DetailItem
                                                        label="Period"
                                                        value={`${fmtUtcDateTime(row.start)} – ${fmtUtcDateTime(row.end)}`}
                                                    />
                                                    <DetailItem
                                                        label="Compared ledger entries"
                                                        value={row.compared_entry_ids?.join(
                                                            ", ",
                                                        )}
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
                                                        value={fmtNumber(
                                                            row.resource_count,
                                                        )}
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
