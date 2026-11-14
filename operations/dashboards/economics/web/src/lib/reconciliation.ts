import type { ArchiveCheck, Data } from "../types";
import { cloudCategory } from "./categories";
import {
    computeModeIndex,
    directDeliveryData,
    managedInferenceData,
    pollenComputeMode,
} from "./computeModes";
import {
    hasArchivedEvidence,
    hasReconciledTransactionEvidence,
    isAcknowledgedLostTransactionEvidence,
    supplierInvoiceLinks,
} from "./documents";
import { forecastRuleEntries } from "./forecastTerms";
import { toUsd } from "./fx";
import { gpuWorkloadRows } from "./gpu";
import { monthlyLedgerAuditRows } from "./ledgerAudit";
import { ledgerModelResolver } from "./modelIdentity";
import { modelReconcileRows } from "./modelReconcile";
import { collectMonths, reportingMonths } from "./months";
import { providerAccountBalanceRows } from "./providerBalances";
import { providerCloseRows } from "./providerClose";
import {
    meterDriftExplanation,
    pollenWitnessExplanation,
    providerCheckExplanation,
    resolveProvider,
} from "./providerRegistry";
import { buildRunway } from "./runway";
import { salesSourceIssues } from "./sales";
import {
    providerCostCheck,
    unitEconomicsReport,
    unitEconomicsRows,
} from "./unitEconomics";
import { vendorSourceDifferences } from "./vendorLedger";

export const RECONCILIATION_PAGES = {
    inference: "Inference",
    vendors: "Providers",
    gpu: "GPUs",
    trends: "Trends",
    runway: "Runway",
    balances: "Balances",
    "vendor-ledger": "Vendor ledger",
    "op-transactions": "Bank",
    "op-pollen": "Pollen",
} as const;
export type ReconciliationPage = keyof typeof RECONCILIATION_PAGES;
export const RECONCILIATION_TYPES = {
    totals: "Blocks results",
    provisional: "Provisional results",
    figures: "Missing figures",
    forecast: "Payment / forecast",
    coverage: "Account coverage",
    quality: "Data quality",
    models: "Model mapping",
    documents: "Documents",
} as const;
export type ReconciliationType = keyof typeof RECONCILIATION_TYPES;
export const RECONCILIATION_GROUPS = {
    financial: "Could change totals",
    validation: "Recorded amounts · validate",
    models: "Model/GPU breakdown",
} as const;
export type ReconciliationGroup = keyof typeof RECONCILIATION_GROUPS;
export type ReconciliationAmount = {
    amountUsd: number | null;
    amountLabel: string;
    group: ReconciliationGroup;
};
export type ReconciliationException = {
    relatedAmounts?: ReconciliationAmount[];
    id: string;
    month: string;
    vendor: string;
    messages: string[];
    affects: ReconciliationPage[];
    evidence: string[];
};
export type ReconciliationIssue = {
    id: string;
    month: string;
    vendor: string;
    messages: string[];
    blockingMessages?: string[];
    types: ReconciliationType[];
    affects: ReconciliationPage[];
    priority: number;
    group: ReconciliationGroup;
    // A known related amount, not a claimed error in profit.
    amountUsd: number | null;
    amountLabel: string;
    evidence: string[];
    archiveChecks?: ArchiveCheck[];
    invoices?: string[];
    relatedAmounts?: ReconciliationAmount[];
    reviewedNotes?: { message: string; evidence: string[] }[];
};

export function isModelDetail(issue: ReconciliationIssue): boolean {
    return issue.group === "models";
}

// Include infrastructure evidence here: excluding it made recorded Exa usage
// look like a missing bill. Balances and grants never prove monthly usage.
export function missingUsageCosts(data: Data) {
    const covered = new Set(
        (data.vendorLedger ?? [])
            .filter(
                (row) =>
                    ["compute", "infrastructure"].includes(
                        cloudCategory(row),
                    ) && !(row.credit > 0 && row.paid === 0),
            )
            .map((row) => `${row.start.slice(0, 7)}|${row.vendor}`),
    );
    const gaps = new Map<
        string,
        { month: string; vendor: string; meterUsd: number }
    >();
    for (const row of data.opPollen ?? []) {
        if (resolveProvider(row.vendor)?.meteringBasis === "internal") continue;
        if (
            ![
                row.price_paid,
                row.price_quests,
                row.cost_paid,
                row.cost_quests,
            ].some((n) => n !== 0)
        )
            continue;
        const key = `${row.month}|${row.vendor}`;
        if (covered.has(key)) continue;
        const gap = gaps.get(key) ?? {
            month: row.month,
            vendor: row.vendor,
            meterUsd: 0,
        };
        gap.meterUsd += toUsd(
            row.cost_paid + row.cost_quests,
            row.currency,
            row.month,
        );
        gaps.set(key, gap);
    }
    return [...gaps.values()];
}

export function reconciliationState(data: Data, now = new Date()) {
    const currentMonth = now.toISOString().slice(0, 7);
    const byKey = new Map<string, ReconciliationIssue>();
    const acceptedExceptions: ReconciliationException[] = [];
    const add = (
        month: string,
        vendor: string,
        type: ReconciliationType,
        message: string,
        affects: ReconciliationPage[],
        priority = 1,
        amountUsd: number | null = null,
        amountLabel = "Impact unknown",
        evidence: string[] = [],
        group: ReconciliationGroup = type === "models"
            ? "models"
            : type === "quality" || type === "documents"
              ? "validation"
              : "financial",
    ) => {
        // Open months are pending, not overdue historical reconciliation.
        if (month > currentMonth) return;
        const id = `${month}|${vendor}`;
        const old = byKey.get(id);
        const groups = Object.keys(RECONCILIATION_GROUPS);
        // A financial gap outranks validation and allocation. Amounts within
        // one provider/month can overlap. Compare only amounts with the same
        // basis; a meter estimate must not replace an invoice difference.
        const replaceAmount =
            !old ||
            groups.indexOf(group) < groups.indexOf(old.group) ||
            (group === old.group &&
                amountLabel === old.amountLabel &&
                amountUsd != null &&
                (old.amountUsd == null || amountUsd > old.amountUsd));
        const relatedAmounts = [...(old?.relatedAmounts ?? [])];
        const sameBasis = relatedAmounts.findIndex(
            (item) => item.group === group && item.amountLabel === amountLabel,
        );
        if (sameBasis < 0)
            relatedAmounts.push({ amountUsd, amountLabel, group });
        else if (
            amountUsd != null &&
            amountUsd > (relatedAmounts[sameBasis].amountUsd ?? -1)
        )
            relatedAmounts[sameBasis] = { amountUsd, amountLabel, group };
        byKey.set(
            id,
            old
                ? {
                      ...old,
                      messages: [...new Set([...old.messages, message])],
                      types: [...new Set([...old.types, type])],
                      affects: [...new Set([...old.affects, ...affects])],
                      priority: Math.min(old.priority, priority),
                      group: replaceAmount ? group : old.group,
                      amountUsd: replaceAmount ? amountUsd : old.amountUsd,
                      amountLabel: replaceAmount
                          ? amountLabel
                          : old.amountLabel,
                      evidence: [...new Set([...old.evidence, ...evidence])],
                      relatedAmounts,
                  }
                : {
                      id,
                      month,
                      vendor,
                      messages: [message],
                      types: [type],
                      affects,
                      priority,
                      group,
                      amountUsd,
                      amountLabel,
                      evidence,
                      relatedAmounts,
                  },
        );
    };
    const addReviewedNote = (
        month: string,
        vendor: string,
        reviewed:
            | { explanation: string; evidence: string[] }
            | null
            | undefined,
    ) => {
        const issue = byKey.get(`${month}|${vendor}`);
        if (!issue || !reviewed) return;
        issue.reviewedNotes ??= [];
        if (
            !issue.reviewedNotes.some(
                (note) => note.message === reviewed.explanation,
            )
        )
            issue.reviewedNotes.push({
                message: reviewed.explanation,
                evidence: reviewed.evidence,
            });
        issue.evidence = [
            ...new Set([...issue.evidence, ...reviewed.evidence]),
        ];
    };
    const modes = computeModeIndex(data);
    const identity = ledgerModelResolver(data);
    const costPages = (vendor: string, month: string): ReconciliationPage[] => {
        const pages: ReconciliationPage[] = [
            "trends",
            "runway",
            "vendor-ledger",
        ];
        if (resolveProvider(vendor)?.category !== "infrastructure")
            pages.push("vendors");
        const mode = pollenComputeMode(modes, month, vendor);
        if (mode === "managed-inference" || mode === "mixed")
            pages.push("inference");
        if (mode === "gpu-capacity" || mode === "mixed") pages.push("gpu");
        if (
            mode === "unclassified" &&
            resolveProvider(vendor)?.category !== "infrastructure"
        )
            pages.push("inference", "gpu");
        return pages;
    };
    for (const gap of missingUsageCosts(data)) {
        if (gap.month >= currentMonth) continue;
        add(
            gap.month,
            gap.vendor,
            "figures",
            "Provider costs and cash/credit split are missing for recorded Pollen usage.",
            costPages(gap.vendor, gap.month),
            0,
            gap.meterUsd,
            "Usage meter estimate · bill and impact unknown",
        );
    }
    // Recurring budgets remain forecasts. Missing review evidence does not
    // turn their amounts into booked costs or change recorded results.
    const reviewedPlans = new Set(
        data.privateConfig?.reviewNotes.planNotes?.map((note) => note.entryId),
    );
    for (const plan of data.vendorPlans ?? []) {
        if (
            plan.plan_cadence !== "monthly" ||
            reviewedPlans.has(plan.entry_id) ||
            (plan.end && plan.end < currentMonth)
        )
            continue;
        add(
            currentMonth,
            plan.vendor,
            "documents",
            `Recurring forecast (${plan.plan_category}, ${plan.currency}${plan.start ? `, from ${plan.start}` : ""}) has no supporting review note. Confirm its basis; this is a forecast assumption, not a booked expense.`,
            ["runway", "vendor-ledger"],
            2,
            null,
            "Forecast assumption · basis unverified",
            plan.evidence ? [plan.evidence] : [],
            "validation",
        );
    }
    const runway = buildRunway(
        data.opTransactions ?? [],
        now,
        data.vendorLedger ?? [],
        data.privateConfig?.forecastRules,
        data.stripeSales ?? [],
    );
    const scheduledRules = forecastRuleEntries(
        data.privateConfig?.forecastRules,
    );
    for (const flag of runway.flags) {
        const bankVendor = /^Bank paid (\S+)/.exec(flag)?.[1];
        const scheduledVendor = /^Scheduled (\S+)/.exec(flag)?.[1];
        const months = [
            ...new Set(flag.match(/\b20\d{2}-\d{2}\b/g) ?? [currentMonth]),
        ];
        for (const month of months) {
            if (bankVendor) {
                const payments = (data.opTransactions ?? []).filter(
                    (r) =>
                        r.kind === "transaction" &&
                        r.vendor === bankVendor &&
                        r.date.startsWith(month) &&
                        r.amount < 0,
                );
                const amount = -payments.reduce(
                    (sum, r) => sum + toUsd(r.amount, r.currency, month),
                    0,
                );
                add(
                    month,
                    bankVendor,
                    "figures",
                    payments.length > 0 &&
                        payments.every(
                            (payment) =>
                                supplierInvoiceLinks(payment.evidence).length >
                                0,
                        )
                        ? "Invoice retained; service-month usage still needs reconciliation."
                        : "Bank payment recorded; invoice or service-month usage is missing.",
                    costPages(bankVendor, month),
                    0,
                    amount,
                    "Bank payment · expense to reconcile",
                    payments.map((payment) => payment.evidence),
                );
            } else {
                const scheduled = scheduledRules
                    .filter((row) => row.vendor === scheduledVendor)
                    .flatMap((row) => row.rule.scheduledAmounts ?? [])
                    .filter((row) => row.month === month);
                const amount = scheduled.length
                    ? Math.abs(
                          scheduled.reduce(
                              (sum, row) =>
                                  sum + toUsd(row.amount, row.currency, month),
                              0,
                          ),
                      )
                    : null;
                add(
                    month,
                    scheduledVendor ?? "Forecast",
                    "forecast",
                    flag,
                    ["runway"],
                    1,
                    amount,
                    amount == null
                        ? "Impact unknown"
                        : "Scheduled amount · settlement unconfirmed",
                );
            }
        }
    }
    for (const row of providerAccountBalanceRows(data, now)) {
        if (!row.active || !row.balanceTracking) continue;
        if (
            row.balanceStatus === "not_checked" ||
            row.balanceStatus === "stale"
        ) {
            add(
                currentMonth,
                row.vendor,
                "coverage",
                `${row.accountLabel}: ${row.balanceStatus === "stale" ? "refresh the outdated balance snapshot" : "record a checked balance snapshot"}.`,
                ["balances", "runway"],
                1,
            );
        }
        if (
            (row.creditBalanceUsd ?? 0) > 0 &&
            !row.creditTermsKnown &&
            !row.expiryAssumed
        ) {
            add(
                currentMonth,
                row.vendor,
                "forecast",
                `${row.accountLabel}: confirm the credit expiry or record an approved planning assumption.`,
                ["balances", "runway"],
                1,
            );
        }
    }
    for (const row of unitEconomicsRows(
        modelReconcileRows(directDeliveryData(data)),
        "provider",
    )) {
        if (
            row.month >= currentMonth ||
            providerCostCheck(row).kind !== "review"
        )
            continue;
        const reviewed = meterDriftExplanation(
            row.month,
            row.vendor,
            data.privateConfig,
        );
        add(
            row.month,
            row.vendor,
            "quality",
            reviewed
                ? `Known historical meter gap: ${reviewed.explanation}`
                : "Provider cost and the Pollen cost meter differ by more than the review threshold (25% and $100). Check the usage and invoice records.",
            ["vendors", "inference", "vendor-ledger", "op-pollen"],
            1,
            Math.abs(row.meterGapUsd ?? 0),
            "Provider / usage-meter difference",
            reviewed?.evidence ?? [],
        );
    }
    // Recomputed from ledger facts on every load; no saved issue state.
    for (const difference of vendorSourceDifferences(data)) {
        add(
            difference.month,
            difference.provider,
            "quality",
            difference.explanation,
            costPages(difference.provider, difference.month),
            1,
            difference.amountUsd,
            difference.amountLabel ??
                "Invoice difference · not included in costs",
            difference.evidence,
            "financial",
        );
    }
    for (const row of providerCloseRows(data, currentMonth)) {
        if (row.partial) continue;
        const reviewed =
            row.coverageStatus === "exception"
                ? providerCheckExplanation(
                      row.month,
                      row.vendor,
                      data.privateConfig,
                  )
                : null;
        const acknowledged = (data.opTransactions ?? []).filter(
            (transaction) =>
                transaction.kind === "transaction" &&
                transaction.vendor === row.vendor &&
                transaction.date.startsWith(row.month) &&
                isAcknowledgedLostTransactionEvidence(transaction),
        );
        if (reviewed || acknowledged.length) {
            acceptedExceptions.push({
                id: `${row.month}|${row.vendor}`,
                relatedAmounts: acknowledged.length
                    ? [
                          {
                              amountUsd: acknowledged.reduce(
                                  (sum, transaction) =>
                                      sum +
                                      Math.abs(
                                          toUsd(
                                              transaction.amount,
                                              transaction.currency,
                                              row.month,
                                          ),
                                      ),
                                  0,
                              ),
                              amountLabel:
                                  "Recorded payments · document unavailable",
                              group: "validation",
                          },
                      ]
                    : undefined,
                month: row.month,
                vendor: row.vendor,
                messages: [
                    ...new Set([
                        ...(reviewed ? [reviewed.explanation] : []),
                        ...acknowledged.map(
                            (transaction) => transaction.description,
                        ),
                    ]),
                ],
                affects: [
                    ...new Set<ReconciliationPage>([
                        ...(reviewed
                            ? [
                                  ...costPages(row.vendor, row.month),
                                  "op-pollen" as const,
                              ]
                            : []),
                        ...(acknowledged.length
                            ? ["op-transactions" as const]
                            : []),
                    ]),
                ],
                evidence: [
                    ...new Set([
                        ...(reviewed?.evidence ?? []),
                        ...acknowledged.map(
                            (transaction) => transaction.evidence,
                        ),
                    ]),
                ],
            });
        }
        if (row.closeStatus === "ready") continue;
        const evidence = row.evidence.map((r) => r.evidence);
        if (row.closeStatus === "missing document") {
            const pending = (data.opTransactions ?? []).filter(
                (transaction) =>
                    transaction.kind === "transaction" &&
                    transaction.vendor === row.vendor &&
                    transaction.date.slice(0, 7) === row.month &&
                    !hasReconciledTransactionEvidence(transaction),
            );
            const invoiceRetained =
                pending.length > 0 &&
                pending.every(
                    (transaction) =>
                        supplierInvoiceLinks(transaction.evidence).length > 0,
                );
            add(
                row.month,
                row.vendor,
                invoiceRetained ? "quality" : "documents",
                invoiceRetained
                    ? "Invoice retained; payment or balance still needs reconciliation."
                    : pending.some((transaction) =>
                            hasArchivedEvidence(transaction.evidence),
                        )
                      ? "A source is linked; validate the supplier invoice and its payment match."
                      : "Bank transaction document is missing or not linked.",
                ["op-transactions"],
                2,
                null,
                "Document check · no new amount inferred",
                [
                    ...evidence,
                    ...pending.map((transaction) => transaction.evidence),
                ],
                invoiceRetained ? "financial" : "validation",
            );
        } else {
            add(
                row.month,
                row.vendor,
                "coverage",
                row.closeStatus === "needs account check"
                    ? `Monthly usage or zero activity needs confirmation${row.missingAccounts?.length ? ` for ${row.missingAccounts.join(", ")}` : " for all accounts"}.`
                    : "Monthly provider evidence is missing or does not cover the full month.",
                costPages(row.vendor, row.month),
                1,
                null,
                "Impact unknown",
                evidence,
            );
        }
    }
    const addHistoricalName = (
        month: string,
        vendor: string,
        model: string,
    ) => {
        if (
            month >= currentMonth ||
            resolveProvider(vendor)?.category !== "compute" ||
            !identity.unresolved(month, vendor, model)
        )
            return;
        add(
            month,
            vendor,
            "models",
            `Historical model name needs an exact match for this month: ${model}.`,
            ["inference", "gpu", "vendors", "vendor-ledger", "op-pollen"],
            2,
            null,
            "Name unresolved · totals unchanged",
        );
    };
    for (const row of data.vendorLedger ?? []) {
        if (row.paid >= 0 && row.credit >= 0) continue;
        const resolution = identity.ledger(row);
        const models =
            resolution.kind === "model"
                ? [resolution.model]
                : resolution.kind === "shared"
                  ? resolution.models
                  : [];
        for (const model of models)
            addHistoricalName(row.start.slice(0, 7), row.vendor, model);
    }
    for (const row of data.opPollen ?? []) {
        if (
            row.month >= currentMonth ||
            row.vendor === "community" ||
            (row.price_paid === 0 && row.price_quests === 0)
        )
            continue;
        addHistoricalName(row.month, row.vendor, row.model);
    }
    for (const row of modelReconcileRows(managedInferenceData(data, modes))) {
        if (row.month >= currentMonth) continue;
        const amount =
            row.buckets.missingBreakdownUsd + row.buckets.needsMappingUsd;
        if (amount > 0.005)
            add(
                row.month,
                row.vendor,
                "models",
                "Add the missing model breakdown or map the unmatched invoice labels; provider totals are unchanged.",
                ["inference", "vendor-ledger"],
                2,
                amount,
                "Recorded cost · model allocation only",
            );
        for (const status of [
            "missing usage",
            "ambiguous allocation",
        ] as const) {
            const models = row.models.filter(
                (model) => model.status === status,
            );
            if (!models.length) continue;
            const amounts = models
                .map((model) => model.providerUsageUsd)
                .filter((amount): amount is number => amount != null);
            add(
                row.month,
                row.vendor,
                "models",
                status === "missing usage"
                    ? "Billed models have no matching Pollen usage; provider totals are unchanged."
                    : "Shared model cost allocation is unresolved; provider totals are unchanged.",
                ["inference", "vendors", "vendor-ledger", "op-pollen"],
                2,
                amounts.length
                    ? amounts.reduce((sum, amount) => sum + amount, 0)
                    : null,
                status === "missing usage"
                    ? "Recorded cost · model usage missing"
                    : "Recorded cost · shared allocation unresolved",
            );
            if (status === "missing usage")
                addReviewedNote(
                    row.month,
                    row.vendor,
                    pollenWitnessExplanation(
                        row.month,
                        row.vendor,
                        data.privateConfig,
                    ),
                );
        }
    }
    // Derive GPU issues from exactly the same workload join as the GPU page.
    for (const month of collectMonths(data).filter(
        (month) => month < currentMonth,
    )) {
        const vendors = new Set([
            ...(data.vendorLedger ?? [])
                .filter(
                    (row) => row.type === "gpu" && row.start.startsWith(month),
                )
                .map((row) => row.vendor),
            ...(data.opPollen ?? [])
                .filter(
                    (row) =>
                        row.month === month &&
                        pollenComputeMode(
                            modes,
                            month,
                            row.vendor,
                            row.model,
                        ) === "gpu-capacity",
                )
                .map((row) => row.vendor),
        ]);
        for (const vendor of vendors) {
            for (const row of gpuWorkloadRows(data, month, vendor)) {
                for (const flag of row.flags) {
                    const reviewed =
                        flag === "missing Pollen"
                            ? pollenWitnessExplanation(
                                  month,
                                  vendor,
                                  data.privateConfig,
                              )
                            : null;
                    const message =
                        flag === "missing GPU cost"
                            ? `GPU usage has no matching resource cost: ${row.workload}.`
                            : flag === "missing Pollen"
                              ? reviewed
                                  ? `GPU usage attribution is unavailable for a reviewed historical period: ${row.workload}.`
                                  : `GPU resource costs have no matching Pollen usage: ${row.workload}.`
                              : flag === "ambiguous workload allocation"
                                ? "Shared GPU workload allocation is unresolved; resource totals are unchanged."
                                : "GPU resource costs have no workload mapping.";
                    add(
                        month,
                        vendor,
                        "models",
                        message,
                        ["gpu", "vendor-ledger", "op-pollen"],
                        2,
                        flag === "missing GPU cost" ? null : row.totalCostUsd,
                        "Workload allocation · provider totals unchanged",
                    );
                    addReviewedNote(month, vendor, reviewed);
                }
            }
        }
    }
    for (const row of monthlyLedgerAuditRows(data, "", currentMonth)) {
        if (row.partial) continue;
        for (const vendor of row.missingMappingProviders)
            add(
                row.month,
                vendor,
                "quality",
                "Provider classification is missing.",
                ["op-pollen", "vendors", "trends"],
                1,
            );
        if (row.missingBankData)
            add(
                row.month,
                "Bank",
                "figures",
                "Bank data is missing.",
                ["op-transactions", "runway", "trends"],
                0,
            );
        if (row.invalidRows || row.duplicateRows)
            add(
                row.month,
                "Ledger integrity",
                "quality",
                `${row.invalidRows} invalid rows; ${row.duplicateRows} duplicate rows. Review the source entries.`,
                [
                    "op-transactions",
                    "vendor-ledger",
                    "op-pollen",
                    "runway",
                    "trends",
                ],
                0,
                null,
                "Impact unknown",
                [],
                "financial",
            );
        if (row.estimatedFx)
            add(
                row.month,
                "Exchange rate",
                "quality",
                "Published monthly exchange rate is missing; an estimate is used.",
                ["trends", "runway", "inference", "vendors", "gpu"],
                1,
                null,
                "Impact unknown",
                [],
                "financial",
            );
    }
    for (const month of reportingMonths(now)) {
        const sales = (data.stripeSales ?? []).filter((r) => r.month === month);
        for (const issue of salesSourceIssues(sales, month, now)) {
            add(
                month,
                "Stripe",
                issue.financial ? "figures" : "quality",
                issue.message,
                ["trends", "runway"],
                issue.financial ? 0 : 2,
                issue.financial ? null : 0,
                issue.financial
                    ? "Impact unknown"
                    : "Financial amounts recorded",
            );
        }
    }
    for (const month of reportingMonths(now)) {
        if (month >= currentMonth) continue;
        for (const view of ["inference", "vendors"] as const) {
            const report = unitEconomicsReport(data, month, view);
            for (const blocker of report.blockers) {
                const reviewed =
                    blocker.kind === "usage"
                        ? pollenWitnessExplanation(
                              month,
                              blocker.vendor,
                              data.privateConfig,
                          )
                        : null;
                const message = reviewed
                    ? "Pollen usage is unavailable for a reviewed historical period."
                    : blocker.message;
                add(
                    month,
                    blocker.vendor,
                    report.provisional ? "provisional" : "totals",
                    message,
                    [view, "vendor-ledger", "op-pollen"],
                    0,
                    blocker.amountUsd,
                    blocker.kind === "costs"
                        ? "Usage meter estimate · bill and impact unknown"
                        : "Recorded cost · usage unknown",
                    [],
                    blocker.kind === "costs" || blocker.kind === "period"
                        ? "financial"
                        : "validation",
                );
                addReviewedNote(month, blocker.vendor, reviewed);
                const issue = byKey.get(`${month}|${blocker.vendor}`);
                if (!issue) continue;
                if (!report.provisional) {
                    issue.blockingMessages = [
                        ...new Set([
                            ...(issue.blockingMessages ?? []),
                            message,
                        ]),
                    ];
                }
            }
        }
    }
    for (const issue of byKey.values()) {
        // Collection method "invoice" can link to an extracted JSON report.
        // Only explicit supplier invoice references establish the document kind.
        const invoices = [
            ...new Set(issue.evidence.flatMap(supplierInvoiceLinks)),
        ];
        if (invoices.length) issue.invoices = invoices;
    }
    // Archive observations annotate existing issues; they never prove costs,
    // close an item or create a stale issue after the ledger is reconciled.
    for (const check of data.privateConfig?.reviewNotes.archiveChecks ?? []) {
        const issue = byKey.get(`${check.month}|${check.provider}`);
        if (issue) {
            issue.archiveChecks ??= [];
            issue.archiveChecks.push(check);
            const invoices = check.evidence.flatMap(supplierInvoiceLinks);
            if (invoices.length)
                issue.invoices = [
                    ...new Set([...(issue.invoices ?? []), ...invoices]),
                ];
        }
    }
    // Explicitly accepted historical detail gaps remain visible as limitations,
    // without repeated actions. Financial blockers and source differences stay open.
    for (const exception of acceptedExceptions) {
        const issue = byKey.get(exception.id);
        const decision = providerCheckExplanation(
            exception.month,
            exception.vendor,
            data.privateConfig,
        );
        const usageNote = pollenWitnessExplanation(
            exception.month,
            exception.vendor,
            data.privateConfig,
        );
        if (
            decision?.decision !== "known_limitation" ||
            !issue ||
            !issue.types.every(
                (type) =>
                    type === "models" ||
                    (type === "provisional" &&
                        usageNote?.reason === "unverifiable_history"),
            )
        )
            continue;
        exception.messages = [
            ...new Set([
                ...exception.messages,
                "Model detail remains unavailable; recorded amounts are unchanged.",
                ...(issue.types.includes("provisional")
                    ? [
                          "Usage remains incomplete; results from recorded figures stay provisional.",
                      ]
                    : []),
            ]),
        ];
        exception.affects = [
            ...new Set([...exception.affects, ...issue.affects]),
        ];
        exception.evidence = [
            ...new Set([...exception.evidence, ...issue.evidence]),
        ];
        exception.relatedAmounts = issue.relatedAmounts?.length
            ? issue.relatedAmounts
            : [
                  {
                      amountUsd: issue.amountUsd,
                      amountLabel: issue.amountLabel,
                      group: issue.group,
                  },
              ];
        byKey.delete(exception.id);
    }
    return {
        acceptedExceptions: acceptedExceptions.sort(
            (a, b) =>
                b.month.localeCompare(a.month) ||
                a.vendor.localeCompare(b.vendor),
        ),
        issues: [...byKey.values()].sort(
            (a, b) =>
                a.priority - b.priority ||
                (b.amountUsd ?? 0) - (a.amountUsd ?? 0) ||
                b.month.localeCompare(a.month) ||
                a.vendor.localeCompare(b.vendor),
        ),
    };
}
