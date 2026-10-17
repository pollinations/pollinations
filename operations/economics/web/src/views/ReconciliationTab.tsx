import {
    TabButton,
    TableBody,
    TableCell,
    TableDisclosureButton,
    TableHead,
    TableHeaderCell,
    TableRow,
} from "@pollinations/ui";
import { useMemo, useState } from "react";
import {
    DataTable,
    type SortColumn,
    TableScroller,
    useSortableRows,
} from "../components/DataTable";
import { EvidenceAction, EvidencePreview } from "../components/Evidence";
import { useAmountDisplay } from "../components/ReconcilePro";
import { categoryLabel } from "../lib/categories";
import { unreconciledBankAmount } from "../lib/dataConfidence";
import { type DriveDocumentLink, driveDocumentLink } from "../lib/documents";
import { hasVisibleAmount } from "../lib/format";
import { monthName } from "../lib/months";
import { canonicalProvider } from "../lib/providerRegistry";
import {
    RECONCILIATION_GROUPS,
    RECONCILIATION_PAGES,
    RECONCILIATION_TYPES,
    type ReconciliationException,
    type ReconciliationIssue,
    type ReconciliationPage,
    type ReconciliationType,
} from "../lib/reconciliation";
import { vendorDirectoryRows } from "../lib/vendorDirectory";
import type { Data, OpTransactionRow } from "../types";
import { VendorAccounts } from "./VendorAccounts";
import { journalEntries, VendorJournal } from "./VendorJournal";

type VendorChecks = {
    vendor: string;
    issues: ReconciliationIssue[];
    limitations: ReconciliationException[];
    bankAmount: number | null;
    unknowns: number;
};

const SORT_COLUMNS: SortColumn<VendorChecks>[] = [
    { key: "vendor", value: (row) => row.vendor },
    { key: "checks", value: (row) => row.issues.length },
    { key: "unknowns", value: (row) => row.unknowns },
    { key: "amount", value: (row) => row.bankAmount },
];

export function ReconciliationTab({
    data,
    scope,
    onClearScope,
    issues,
    transactions,
    year,
    onOpen,
    acceptedExceptions = [],
}: {
    data?: Data;
    scope?: { ids: string[]; label: string } | null;
    onClearScope?: () => void;
    issues: ReconciliationIssue[];
    transactions?: OpTransactionRow[];
    acceptedExceptions?: ReconciliationException[];
    year: string;
    onOpen: (page: ReconciliationPage, month: string) => void;
}) {
    const { pro, fmtUsd } = useAmountDisplay();
    const [previewDocument, setPreviewDocument] =
        useState<DriveDocumentLink | null>(null);
    const [type, setType] = useState<ReconciliationType | "known" | "">("");
    const [query, setQuery] = useState("");
    const directory = useMemo(
        () => (data ? vendorDirectoryRows(data, new Date()) : []),
        [data],
    );
    const journal = useMemo(
        () =>
            data?.privateConfig
                ? journalEntries(data.privateConfig, data.vendorPlans)
                : [],
        [data],
    );
    const [expanded, setExpanded] = useState<string[]>([]);
    const scoped = issues.filter((row) =>
        scope ? scope.ids.includes(row.id) : row.month.startsWith(`${year}-`),
    );
    const accepted = acceptedExceptions.filter(
        (row) =>
            !scope &&
            row.month.startsWith(`${year}-`) &&
            (!type || type === "known"),
    );
    const visible = scoped.filter(
        (row) =>
            (!type || (type !== "known" && row.types.includes(type))) &&
            (pro ||
                hasVisibleAmount([
                    row.amountUsd,
                    ...(row.relatedAmounts ?? []).map(
                        (amount) => amount.amountUsd,
                    ),
                ])),
    );
    const matchesVendor = (vendor: string) => {
        const row = directory.find((row) => row.provider.id === vendor);
        return [
            vendor,
            row?.provider.label,
            ...(row?.accounts.flatMap((account) => [
                account.id,
                account.label,
                account.login,
            ]) ?? []),
        ]
            .join(" ")
            .toLowerCase()
            .includes(query.trim().toLowerCase());
    };
    const vendors = [
        ...new Set([
            ...(!type && !scope ? directory.map((row) => row.provider.id) : []),
            ...visible.map((row) => canonicalProvider(row.vendor)),
            ...accepted.map((row) => canonicalProvider(row.vendor)),
            ...(!type && !scope
                ? journal.map((row) =>
                      canonicalProvider(row.journalVendor ?? row.vendor),
                  )
                : []),
        ]),
    ].filter(matchesVendor);
    const grouped: VendorChecks[] = vendors.map((vendor) => {
        const vendorIssues = visible.filter(
            (issue) => canonicalProvider(issue.vendor) === vendor,
        );
        return {
            vendor,
            issues: vendorIssues,
            limitations: accepted.filter(
                (row) => canonicalProvider(row.vendor) === vendor,
            ),
            unknowns: vendorIssues.filter((issue) => issue.amountUsd == null)
                .length,
            bankAmount: unreconciledBankAmount(
                transactions?.filter(
                    (row) => canonicalProvider(row.vendor) === vendor,
                ),
                year,
            ),
        };
    });
    const { rows, headerProps } = useSortableRows(grouped, SORT_COLUMNS, {
        key: "amount",
        direction: "desc",
    });
    const types = Object.keys(RECONCILIATION_TYPES) as ReconciliationType[];
    const displayedChecks = grouped.reduce(
        (sum, row) => sum + row.issues.length,
        0,
    );
    const totalChecks = scoped.filter(
        (row) =>
            (!type || (type !== "known" && row.types.includes(type))) &&
            matchesVendor(canonicalProvider(row.vendor)),
    ).length;
    const unknownAmounts = grouped.reduce((sum, row) => sum + row.unknowns, 0);
    return (
        <section className="flex flex-col gap-4">
            {scope && (
                <div className="flex items-center gap-3 text-sm">
                    <span>{scope.label}</span>
                    <button
                        type="button"
                        className="underline"
                        onClick={onClearScope}
                    >
                        Show all checks
                    </button>
                </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <input
                    aria-label="Search vendors"
                    placeholder="Search vendor or account…"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    className="w-64 rounded-lg border border-theme-text-soft/20 bg-transparent px-3 py-2 text-sm"
                />
            </div>
            <fieldset className="flex flex-wrap gap-2" aria-label="Issue type">
                <TabButton
                    active={type === ""}
                    aria-pressed={type === ""}
                    size="sm"
                    variant="soft"
                    onClick={() => setType("")}
                >
                    All
                </TabButton>
                {types.map((key) => (
                    <TabButton
                        key={key}
                        active={type === key}
                        aria-pressed={type === key}
                        size="sm"
                        variant="soft"
                        onClick={() => setType(key)}
                    >
                        {RECONCILIATION_TYPES[key]} ·{" "}
                        {scoped.filter((row) => row.types.includes(key)).length}
                    </TabButton>
                ))}
                {!scope && (
                    <TabButton
                        active={type === "known"}
                        aria-pressed={type === "known"}
                        size="sm"
                        variant="soft"
                        onClick={() => setType("known")}
                    >
                        Known limitations ·{" "}
                        {
                            acceptedExceptions.filter((row) =>
                                row.month.startsWith(`${year}-`),
                            ).length
                        }
                    </TabButton>
                )}
            </fieldset>
            <span className="text-sm text-theme-text-soft">
                {vendors.length} vendors ·{" "}
                {displayedChecks === totalChecks
                    ? `${totalChecks} open checks`
                    : `${displayedChecks} of ${totalChecks} open checks shown · ${totalChecks - displayedChecks} below $1 (Pro)`}{" "}
                · {scope ? scope.label : year}
                {unknownAmounts > 0
                    ? ` · ${unknownAmounts} amounts unknown`
                    : ""}
            </span>
            {vendors.length === 0 && (
                <p>No checks to display for this selection.</p>
            )}
            {vendors.length > 0 && (
                <TableScroller>
                    <DataTable className="[&_td]:align-top [&_td]:whitespace-normal">
                        <TableHead>
                            <TableRow>
                                <TableHeaderCell {...headerProps("vendor")}>
                                    Vendor
                                </TableHeaderCell>
                                <TableHeaderCell
                                    {...headerProps("checks")}
                                    align="right"
                                >
                                    Open checks
                                </TableHeaderCell>
                                <TableHeaderCell
                                    {...headerProps("unknowns")}
                                    align="right"
                                >
                                    Unknown amounts
                                </TableHeaderCell>
                                <TableHeaderCell
                                    {...headerProps("amount")}
                                    align="right"
                                >
                                    <span
                                        title={`${year}: recorded bank money without reconciled evidence. Missing sources and provider cost differences are separate checks below.`}
                                    >
                                        Bank money to reconcile
                                    </span>
                                </TableHeaderCell>
                            </TableRow>
                        </TableHead>
                        {rows.map((group) => {
                            const vendor = directory.find(
                                (row) => row.provider.id === group.vendor,
                            );
                            const notes = journal.filter(
                                (entry) =>
                                    canonicalProvider(
                                        entry.journalVendor ?? entry.vendor,
                                    ) === group.vendor &&
                                    (!vendor ||
                                        entry.kind !== "Evidence review") &&
                                    ![
                                        ...group.issues,
                                        ...group.limitations,
                                    ].some(
                                        (check) =>
                                            check.month === entry.period &&
                                            check.messages.some((message) =>
                                                message.includes(entry.note),
                                            ),
                                    ) &&
                                    !group.issues.some(
                                        (check) =>
                                            check.month === entry.period &&
                                            check.reviewedNotes?.some((note) =>
                                                note.message.includes(
                                                    entry.note,
                                                ),
                                            ),
                                    ),
                            );
                            const documentUrl =
                                data?.privateConfig?.vendorDocuments?.[
                                    group.vendor
                                ];
                            return (
                                <TableBody key={group.vendor}>
                                    <TableRow className="runway-summary">
                                        <TableCell className="font-semibold">
                                            <TableDisclosureButton
                                                expanded={expanded.includes(
                                                    group.vendor,
                                                )}
                                                onClick={() =>
                                                    setExpanded((current) =>
                                                        current.includes(
                                                            group.vendor,
                                                        )
                                                            ? current.filter(
                                                                  (vendor) =>
                                                                      vendor !==
                                                                      group.vendor,
                                                              )
                                                            : [
                                                                  ...current,
                                                                  group.vendor,
                                                              ],
                                                    )
                                                }
                                            >
                                                {vendor?.provider.label ??
                                                    group.vendor}
                                            </TableDisclosureButton>
                                            {group.limitations.length > 0 && (
                                                <span className="ml-5 block text-xs font-normal text-theme-text-soft">
                                                    {group.limitations.length}{" "}
                                                    known{" "}
                                                    {group.limitations
                                                        .length === 1
                                                        ? "limitation"
                                                        : "limitations"}
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell align="right">
                                            {group.issues.length}
                                        </TableCell>
                                        <TableCell align="right">
                                            {group.unknowns || "–"}
                                        </TableCell>
                                        <TableCell align="right">
                                            {group.bankAmount == null
                                                ? "–"
                                                : fmtUsd(group.bankAmount)}
                                        </TableCell>
                                    </TableRow>
                                    <TableRow
                                        hidden={
                                            !expanded.includes(group.vendor)
                                        }
                                    >
                                        <TableCell colSpan={4} className="p-3">
                                            <div className="space-y-4">
                                                {vendor && (
                                                    <p className="text-sm text-theme-text-soft">
                                                        {categoryLabel(
                                                            vendor.provider
                                                                .category,
                                                        )}
                                                    </p>
                                                )}
                                                {documentUrl && (
                                                    <a
                                                        className="text-sm underline"
                                                        href={documentUrl}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                    >
                                                        Open{" "}
                                                        {vendor?.provider
                                                            .label ??
                                                            group.vendor}{" "}
                                                        journal in Drive ↗
                                                    </a>
                                                )}
                                                {vendor && (
                                                    <VendorAccounts
                                                        row={vendor}
                                                        journalAvailable={
                                                            !!data?.privateConfig
                                                        }
                                                    />
                                                )}
                                                {group.issues.length > 0 ||
                                                group.limitations.length > 0 ? (
                                                    <DataTable>
                                                        <TableHead>
                                                            <TableRow>
                                                                <TableHeaderCell>
                                                                    Details
                                                                </TableHeaderCell>
                                                                <TableHeaderCell>
                                                                    Month
                                                                </TableHeaderCell>
                                                                <TableHeaderCell align="right">
                                                                    Amount
                                                                </TableHeaderCell>
                                                                <TableHeaderCell>
                                                                    Affects
                                                                </TableHeaderCell>
                                                                <TableHeaderCell>
                                                                    Invoices
                                                                </TableHeaderCell>
                                                            </TableRow>
                                                        </TableHead>
                                                        <TableBody>
                                                            {group.issues.map(
                                                                (issue) => (
                                                                    <TableRow
                                                                        key={
                                                                            issue.id
                                                                        }
                                                                    >
                                                                        <TableCell className="min-w-64 max-w-xl">
                                                                            <p className="mb-1 text-xs text-theme-text-soft">
                                                                                {
                                                                                    RECONCILIATION_GROUPS[
                                                                                        issue
                                                                                            .group
                                                                                    ]
                                                                                }
                                                                            </p>
                                                                            {issue.types.map(
                                                                                (
                                                                                    key,
                                                                                ) => (
                                                                                    <span
                                                                                        key={
                                                                                            key
                                                                                        }
                                                                                        className="mr-2 text-xs text-theme-text-soft"
                                                                                    >
                                                                                        {
                                                                                            RECONCILIATION_TYPES[
                                                                                                key
                                                                                            ]
                                                                                        }
                                                                                    </span>
                                                                                ),
                                                                            )}
                                                                            {issue.blockingMessages?.map(
                                                                                (
                                                                                    message,
                                                                                ) => (
                                                                                    <p
                                                                                        key={
                                                                                            message
                                                                                        }
                                                                                    >
                                                                                        {
                                                                                            message
                                                                                        }
                                                                                    </p>
                                                                                ),
                                                                            )}
                                                                            {issue
                                                                                .blockingMessages
                                                                                ?.length &&
                                                                            issue.messages.some(
                                                                                (
                                                                                    message,
                                                                                ) =>
                                                                                    !issue.blockingMessages?.includes(
                                                                                        message,
                                                                                    ),
                                                                            ) ? (
                                                                                <p className="mt-2 text-xs text-theme-text-soft">
                                                                                    Other
                                                                                    checks
                                                                                </p>
                                                                            ) : null}
                                                                            {issue.messages
                                                                                .filter(
                                                                                    (
                                                                                        message,
                                                                                    ) =>
                                                                                        !issue.blockingMessages?.includes(
                                                                                            message,
                                                                                        ),
                                                                                )
                                                                                .map(
                                                                                    (
                                                                                        message,
                                                                                    ) => (
                                                                                        <p
                                                                                            key={
                                                                                                message
                                                                                            }
                                                                                        >
                                                                                            {
                                                                                                message
                                                                                            }
                                                                                        </p>
                                                                                    ),
                                                                                )}
                                                                            <ReviewDetails
                                                                                issue={
                                                                                    issue
                                                                                }
                                                                                onPreview={
                                                                                    setPreviewDocument
                                                                                }
                                                                            />
                                                                        </TableCell>
                                                                        <TableCell className="whitespace-nowrap">
                                                                            {monthName(
                                                                                issue.month,
                                                                            )}
                                                                        </TableCell>
                                                                        <TableCell
                                                                            align="right"
                                                                            className="min-w-36 max-w-48"
                                                                        >
                                                                            {issue.amountUsd !=
                                                                            null ? (
                                                                                <>
                                                                                    {fmtUsd(
                                                                                        issue.amountUsd,
                                                                                    )}
                                                                                    <span className="block text-xs text-theme-text-soft">
                                                                                        {
                                                                                            issue.amountLabel
                                                                                        }
                                                                                    </span>
                                                                                </>
                                                                            ) : (
                                                                                <span className="text-theme-text-soft">
                                                                                    Unknown
                                                                                </span>
                                                                            )}
                                                                            <RelatedAmounts
                                                                                issue={
                                                                                    issue
                                                                                }
                                                                            />
                                                                        </TableCell>
                                                                        <TableCell className="min-w-40 max-w-60">
                                                                            <div className="flex flex-wrap gap-x-2 gap-y-1">
                                                                                {issue.affects.map(
                                                                                    (
                                                                                        page,
                                                                                    ) => (
                                                                                        <button
                                                                                            key={
                                                                                                page
                                                                                            }
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
                                                                                    ),
                                                                                )}
                                                                            </div>
                                                                        </TableCell>
                                                                        <TableCell>
                                                                            <div className="flex flex-col items-start gap-1">
                                                                                {(
                                                                                    issue.invoices ??
                                                                                    []
                                                                                ).map(
                                                                                    (
                                                                                        evidence,
                                                                                        i,
                                                                                    ) => (
                                                                                        <EvidenceAction
                                                                                            key={
                                                                                                evidence
                                                                                            }
                                                                                            evidence={
                                                                                                evidence
                                                                                            }
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
                                                                ),
                                                            )}
                                                            {group.limitations.map(
                                                                (exception) => (
                                                                    <KnownLimitationRow
                                                                        key={
                                                                            exception.id
                                                                        }
                                                                        exception={
                                                                            exception
                                                                        }
                                                                        onPreview={
                                                                            setPreviewDocument
                                                                        }
                                                                        onOpen={
                                                                            onOpen
                                                                        }
                                                                    />
                                                                ),
                                                            )}
                                                        </TableBody>
                                                    </DataTable>
                                                ) : (
                                                    <p className="text-sm text-theme-text-soft">
                                                        No open checks for this
                                                        selection.
                                                    </p>
                                                )}
                                                <VendorJournal
                                                    entries={notes}
                                                />
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                </TableBody>
                            );
                        })}
                    </DataTable>
                </TableScroller>
            )}
            <EvidencePreview
                documentLink={previewDocument}
                onClose={() => setPreviewDocument(null)}
            />
        </section>
    );
}

function KnownLimitationRow({
    exception,
    onPreview,
    onOpen,
}: {
    exception: ReconciliationException;
    onPreview: (document: DriveDocumentLink) => void;
    onOpen: (page: ReconciliationPage, month: string) => void;
}) {
    const { fmtUsd } = useAmountDisplay();
    return (
        <TableRow className="text-theme-text-soft">
            <TableCell className="min-w-64 max-w-xl">
                <p className="mb-1 text-xs">
                    Known limitation · reviewed, not an open check
                </p>
                {exception.messages.map((message) => (
                    <p key={message}>{message}</p>
                ))}
            </TableCell>
            <TableCell>{monthName(exception.month)}</TableCell>
            <TableCell align="right" className="min-w-36 max-w-48">
                {exception.relatedAmounts?.length
                    ? exception.relatedAmounts.map((amount, index) => (
                          <p key={index}>
                              {amount.amountUsd == null
                                  ? "Unknown"
                                  : fmtUsd(amount.amountUsd)}
                              <span className="block text-xs">
                                  {amount.amountLabel}
                              </span>
                          </p>
                      ))
                    : "–"}
            </TableCell>
            <TableCell>
                <div className="flex flex-wrap gap-x-2 gap-y-1">
                    {exception.affects.map((page) => (
                        <button
                            key={page}
                            type="button"
                            className="text-xs underline underline-offset-2"
                            onClick={() => onOpen(page, exception.month)}
                        >
                            {RECONCILIATION_PAGES[page]}
                        </button>
                    ))}
                </div>
            </TableCell>
            <TableCell>
                <div className="flex flex-wrap gap-2">
                    {supportingDocuments(exception.evidence).map(
                        (document, i) => (
                            <EvidenceAction
                                key={document.previewHref}
                                evidence={document.href}
                                onPreview={onPreview}
                                previewLabel={`Preview exception source ${i + 1} for ${exception.vendor}`}
                                openDocumentLabel={`exception source ${i + 1} for ${exception.vendor}`}
                            />
                        ),
                    )}
                </div>
            </TableCell>
        </TableRow>
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
    const { pro, fmtUsd } = useAmountDisplay();
    const amounts = (issue.relatedAmounts ?? []).filter(
        (amount) =>
            (amount.group !== issue.group ||
                amount.amountLabel !== issue.amountLabel) &&
            (pro || hasVisibleAmount([amount.amountUsd])),
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
