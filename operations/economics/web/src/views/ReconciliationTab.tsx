import {
    TabButton,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
} from "@pollinations/ui";
import { useState } from "react";
import {
    DataTable,
    type SortColumn,
    TableScroller,
    useSortableRows,
} from "../components/DataTable";
import { EvidenceAction, EvidencePreview } from "../components/Evidence";
import { StatCards } from "../components/StatCards";
import { dataConfidence } from "../lib/dataConfidence";
import { type DriveDocumentLink, driveDocumentLink } from "../lib/documents";
import { fmtExactUsd as fmtUsd } from "../lib/format";
import { monthName } from "../lib/months";
import {
    RECONCILIATION_GROUPS,
    RECONCILIATION_PAGES,
    RECONCILIATION_TYPES,
    type ReconciliationException,
    type ReconciliationGroup,
    type ReconciliationIssue,
    type ReconciliationPage,
    type ReconciliationType,
} from "../lib/reconciliation";

const SORT_COLUMNS: SortColumn<ReconciliationIssue>[] = [
    { key: "vendor", value: (row) => row.vendor },
    { key: "month", value: (row) => row.month },
    { key: "messages", value: (row) => row.messages.join(" ") },
    { key: "amount", value: (row) => row.amountUsd },
    {
        key: "affects",
        value: (row) =>
            row.affects.map((page) => RECONCILIATION_PAGES[page]).join(", "),
    },
];

export function ReconciliationTab({
    issues,
    year,
    onOpen,
    initialPage = null,
    acceptedExceptions = [],
}: {
    issues: ReconciliationIssue[];
    acceptedExceptions?: ReconciliationException[];
    year: string;
    initialPage?: ReconciliationPage | null;
    onOpen: (page: ReconciliationPage, month: string) => void;
}) {
    const [previewDocument, setPreviewDocument] =
        useState<DriveDocumentLink | null>(null);
    const [page, setPage] = useState<ReconciliationPage | "">(
        initialPage ?? "",
    );
    const [type, setType] = useState<ReconciliationType | "">("");
    const [section, setSection] = useState<ReconciliationGroup>("financial");
    const scoped = issues.filter(
        (row) =>
            row.month.startsWith(`${year}-`) &&
            (!page || row.affects.includes(page)),
    );
    const accepted = acceptedExceptions.filter(
        (row) =>
            row.month.startsWith(`${year}-`) &&
            (!page || row.affects.includes(page)),
    );
    const financial = scoped.filter((row) => row.group === "financial");
    const validation = scoped.filter((row) => row.group === "validation");
    const modelDetails = scoped.filter((row) => row.group === "models");
    const unknownFinancialAmounts = financial.filter(
        (row) => row.amountUsd == null,
    ).length;
    const confidence = dataConfidence(scoped);
    const sectionRows = scoped.filter((row) => row.group === section);
    const visible = sectionRows.filter(
        (row) => !type || row.types.includes(type),
    );
    const { rows, headerProps } = useSortableRows(visible, SORT_COLUMNS, {
        key: "amount",
        direction: "desc",
    });
    const types = Object.keys(RECONCILIATION_TYPES) as ReconciliationType[];
    const groups = [{ key: section, rows }];
    const unknownAmounts = visible.filter(
        (row) => row.amountUsd == null,
    ).length;
    return (
        <section className="flex flex-col gap-4">
            <section aria-label="Reconciliation overview">
                <StatCards
                    items={[
                        {
                            label: "Data confidence",
                            value: confidence.status,
                            detail: `${scoped.length} open checks · ${year}`,
                            tone: scoped.length ? "warn" : "success",
                        },
                        {
                            label: "Financial gaps",
                            value: financial.length,
                            detail: unknownFinancialAmounts
                                ? `${unknownFinancialAmounts} with unknown amounts`
                                : "Could change totals",
                            tone: financial.length ? "warn" : "base",
                        },
                        {
                            label: "Amounts to validate",
                            value: validation.length,
                            detail: "Payments, documents and usage matches",
                        },
                        {
                            label: "Model/GPU details",
                            value: modelDetails.length,
                            detail: "Allocation only; provider totals unchanged",
                        },
                    ]}
                />
            </section>
            <fieldset
                className="flex flex-wrap gap-2"
                aria-label="Reconciliation sections"
            >
                {(
                    Object.keys(RECONCILIATION_GROUPS) as ReconciliationGroup[]
                ).map((key) => (
                    <TabButton
                        key={key}
                        active={section === key}
                        aria-pressed={section === key}
                        size="sm"
                        variant="soft"
                        onClick={() => {
                            setSection(key);
                            setType("");
                        }}
                    >
                        {RECONCILIATION_GROUPS[key]} ·{" "}
                        {scoped.filter((row) => row.group === key).length}
                    </TabButton>
                ))}
            </fieldset>
            <div className="flex flex-wrap items-center gap-3">
                <select
                    aria-label="Affected page"
                    value={page}
                    onChange={(event) =>
                        setPage(event.target.value as ReconciliationPage | "")
                    }
                    className="rounded border border-theme-border bg-surface-opaque px-2 py-1 text-sm"
                >
                    <option value="">All pages</option>
                    {Object.entries(RECONCILIATION_PAGES).map(
                        ([value, label]) => (
                            <option key={value} value={value}>
                                {label}
                            </option>
                        ),
                    )}
                </select>
                <select
                    aria-label="Issue type"
                    value={type}
                    onChange={(event) =>
                        setType(event.target.value as ReconciliationType | "")
                    }
                    className="rounded border border-theme-border bg-surface-opaque px-2 py-1 text-sm"
                >
                    <option value="">All issue types</option>
                    {types.map((key) => (
                        <option key={key} value={key}>
                            {RECONCILIATION_TYPES[key]} ·{" "}
                            {
                                sectionRows.filter((row) =>
                                    row.types.includes(key),
                                ).length
                            }
                        </option>
                    ))}
                </select>
                <span className="text-sm text-theme-text-soft">
                    {visible.length} items · {year}
                    {unknownAmounts > 0
                        ? ` · ${unknownAmounts} amounts unknown`
                        : ""}
                </span>
            </div>
            {visible.length === 0 && (
                <p>No outstanding checks recorded for this selection.</p>
            )}
            {visible.length > 0 && (
                <TableScroller>
                    <DataTable className="[&_td]:align-top [&_td]:whitespace-normal">
                        <TableHead>
                            <TableRow>
                                <TableHeaderCell {...headerProps("vendor")}>
                                    Provider
                                </TableHeaderCell>
                                <TableHeaderCell {...headerProps("messages")}>
                                    What to fix
                                </TableHeaderCell>
                                <TableHeaderCell {...headerProps("month")}>
                                    Month
                                </TableHeaderCell>
                                <TableHeaderCell
                                    {...headerProps("amount")}
                                    align="right"
                                >
                                    Unresolved amount
                                </TableHeaderCell>
                                <TableHeaderCell {...headerProps("affects")}>
                                    Affects
                                </TableHeaderCell>
                                <TableHeaderCell>Invoices</TableHeaderCell>
                            </TableRow>
                        </TableHead>
                        {groups.map((group) => (
                            <TableBody key={group.key}>
                                <TableRow>
                                    <TableHeaderCell
                                        colSpan={6}
                                        scope="rowgroup"
                                        className="bg-surface-opaque"
                                    >
                                        {RECONCILIATION_GROUPS[group.key]} ·{" "}
                                        {group.rows.length}
                                    </TableHeaderCell>
                                </TableRow>
                                {group.rows.map((issue) => (
                                    <TableRow key={issue.id}>
                                        <TableCell className="font-semibold">
                                            {issue.vendor}
                                        </TableCell>
                                        <TableCell className="min-w-64 max-w-xl">
                                            {issue.types.map((key) => (
                                                <span
                                                    key={key}
                                                    className="mr-2 text-xs text-theme-text-soft"
                                                >
                                                    {RECONCILIATION_TYPES[key]}
                                                </span>
                                            ))}
                                            {issue.blockingMessages?.map(
                                                (message) => (
                                                    <p key={message}>
                                                        {message}
                                                    </p>
                                                ),
                                            )}
                                            {issue.blockingMessages?.length &&
                                            issue.messages.some(
                                                (message) =>
                                                    !issue.blockingMessages?.includes(
                                                        message,
                                                    ),
                                            ) ? (
                                                <p className="mt-2 text-xs text-theme-text-soft">
                                                    Other checks
                                                </p>
                                            ) : null}
                                            {issue.messages
                                                .filter(
                                                    (message) =>
                                                        !issue.blockingMessages?.includes(
                                                            message,
                                                        ),
                                                )
                                                .map((message) => (
                                                    <p key={message}>
                                                        {message}
                                                    </p>
                                                ))}
                                            <ReviewDetails
                                                issue={issue}
                                                onPreview={setPreviewDocument}
                                            />
                                        </TableCell>
                                        <TableCell className="whitespace-nowrap">
                                            {monthName(issue.month)}
                                        </TableCell>
                                        <TableCell
                                            align="right"
                                            className="min-w-36 max-w-48"
                                        >
                                            {issue.amountUsd != null ? (
                                                <>
                                                    {fmtUsd(issue.amountUsd)}
                                                    <span className="block text-xs text-theme-text-soft">
                                                        {issue.amountLabel}
                                                    </span>
                                                </>
                                            ) : (
                                                <span className="text-theme-text-soft">
                                                    Unknown
                                                </span>
                                            )}
                                            <RelatedAmounts issue={issue} />
                                        </TableCell>
                                        <TableCell className="min-w-40 max-w-60">
                                            <div className="flex flex-wrap gap-x-2 gap-y-1">
                                                {issue.affects.map((page) => (
                                                    <button
                                                        key={page}
                                                        type="button"
                                                        className="text-xs underline underline-offset-2"
                                                        onClick={() =>
                                                            onOpen(
                                                                page,
                                                                issue.month,
                                                            )
                                                        }
                                                    >
                                                        {
                                                            RECONCILIATION_PAGES[
                                                                page
                                                            ]
                                                        }
                                                    </button>
                                                ))}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col items-start gap-1">
                                                {(issue.invoices ?? []).map(
                                                    (evidence, i) => (
                                                        <EvidenceAction
                                                            key={evidence}
                                                            evidence={evidence}
                                                            onPreview={
                                                                setPreviewDocument
                                                            }
                                                            previewLabel={`Preview invoice ${i + 1} for ${issue.vendor}`}
                                                            openDocumentLabel={`invoice ${i + 1} for ${issue.vendor}`}
                                                        />
                                                    ),
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        ))}
                    </DataTable>
                </TableScroller>
            )}
            {accepted.length > 0 && (
                <details className="rounded-lg border border-theme-border p-3">
                    <summary className="cursor-pointer font-semibold">
                        Known limitations · {accepted.length}
                    </summary>
                    <p className="mt-2 text-sm text-theme-text-soft">
                        Reviewed gaps retained for transparency; excluded from
                        open-check counts.
                    </p>
                    <div className="mt-3 space-y-3">
                        {accepted.map((exception) => (
                            <article key={exception.id}>
                                <p className="font-semibold">
                                    {exception.vendor} ·{" "}
                                    {monthName(exception.month)}
                                </p>
                                {exception.messages.map((message) => (
                                    <p key={message} className="text-sm">
                                        {message}
                                    </p>
                                ))}
                                <div className="flex flex-wrap gap-2">
                                    {supportingDocuments(
                                        exception.evidence,
                                    ).map((document, i) => (
                                        <EvidenceAction
                                            key={document.previewHref}
                                            evidence={document.href}
                                            onPreview={setPreviewDocument}
                                            previewLabel={`Preview exception source ${i + 1} for ${exception.vendor}`}
                                            openDocumentLabel={`exception source ${i + 1} for ${exception.vendor}`}
                                        />
                                    ))}
                                </div>
                            </article>
                        ))}
                    </div>
                </details>
            )}
            <EvidencePreview
                documentLink={previewDocument}
                onClose={() => setPreviewDocument(null)}
            />
        </section>
    );
}

function supportingDocuments(evidence: string[], invoices: string[] = []) {
    const invoiceIds = new Set(
        invoices.map((value) => driveDocumentLink(value)?.previewHref),
    );
    const documents = new Map<string, DriveDocumentLink>();
    for (const value of evidence) {
        const document = driveDocumentLink(value);
        if (document?.previewHref && !invoiceIds.has(document.previewHref))
            documents.set(document.previewHref, document);
    }
    return [...documents.values()];
}

function ReviewDetails({
    issue,
    onPreview,
}: {
    issue: ReconciliationIssue;
    onPreview: (document: DriveDocumentLink) => void;
}) {
    const documents = supportingDocuments(issue.evidence, issue.invoices);
    if (!documents.length && !issue.reviewedNotes?.length) return null;
    return (
        <details className="mt-2 text-xs text-theme-text-soft">
            <summary className="cursor-pointer">Sources and review</summary>
            {issue.reviewedNotes?.map((note) => (
                <p key={note.message} className="mt-2">
                    {note.message}
                </p>
            ))}
            <div className="mt-1 flex flex-wrap gap-2">
                {documents.map((document, i) => (
                    <EvidenceAction
                        key={document.previewHref}
                        evidence={document.href}
                        onPreview={onPreview}
                        previewLabel={`Preview source ${i + 1} for ${issue.vendor}`}
                        openDocumentLabel={`source ${i + 1} for ${issue.vendor}`}
                    />
                ))}
            </div>
        </details>
    );
}

function RelatedAmounts({ issue }: { issue: ReconciliationIssue }) {
    const amounts = (issue.relatedAmounts ?? []).filter(
        (amount) =>
            amount.group !== issue.group ||
            amount.amountLabel !== issue.amountLabel,
    );
    if (!amounts.length) return null;
    return (
        <details className="mt-2 text-xs text-theme-text-soft">
            <summary className="cursor-pointer">
                Other amounts · {amounts.length}
            </summary>
            {amounts.map((amount) => (
                <p
                    key={`${amount.group}|${amount.amountLabel}`}
                    className="mt-2"
                >
                    {amount.amountUsd == null
                        ? "Unknown"
                        : fmtUsd(amount.amountUsd)}{" "}
                    · {amount.amountLabel}
                </p>
            ))}
            <p className="mt-2">
                Different checks can overlap; these amounts are not added
                together.
            </p>
        </details>
    );
}
