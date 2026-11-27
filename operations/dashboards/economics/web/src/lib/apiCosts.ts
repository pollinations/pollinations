import type { Data } from "../types";
import { WINDOW_START } from "./months";
import { ledgerCategory } from "./providerRegistry";
import { canonicalVendor } from "./tb";
import {
    vendorLedgerCreditBurnUsd,
    vendorLedgerMonth,
    vendorLedgerPaidBurnUsd,
} from "./vendorLedger";

export const API_COST_LABELS = {
    inference: "Inference",
    gpu: "GPUs",
    infrastructure: "Infrastructure",
} as const;

type ApiCostKind = keyof typeof API_COST_LABELS;

export type ApiCost = {
    kind: ApiCostKind;
    vendor: string;
    service: string;
    cashUsd: number;
    creditUsd: number;
    totalUsd: number;
};

export function apiCosts(data: Data, month: string): ApiCost[] {
    if (month < WINDOW_START) return [];
    const costs = new Map<string, ApiCost>();
    for (const row of data.vendorLedger ?? []) {
        if (
            vendorLedgerMonth(row) !== month ||
            (row.credit > 0 && row.paid === 0)
        )
            continue;
        const vendor = canonicalVendor(row.vendor);
        const type = row.type.trim().toLowerCase();
        const kind =
            type === "gpu" || type === "inference"
                ? type
                : ledgerCategory(row) === "infrastructure"
                  ? "infrastructure"
                  : null;
        if (
            !kind ||
            ((kind === "inference" || kind === "gpu") && vendor === "community")
        )
            continue;
        const service =
            kind === "infrastructure"
                ? row.resource_name.trim() ||
                  row.resource_sku.trim() ||
                  "Unspecified service"
                : API_COST_LABELS[kind];
        const key = JSON.stringify([vendor, kind, service]);
        const cost = costs.get(key) ?? {
            vendor,
            kind,
            service,
            cashUsd: 0,
            creditUsd: 0,
            totalUsd: 0,
        };
        cost.cashUsd += vendorLedgerPaidBurnUsd(row);
        cost.creditUsd += vendorLedgerCreditBurnUsd(row);
        cost.totalUsd = cost.cashUsd + cost.creditUsd;
        costs.set(key, cost);
    }
    return [...costs.values()].sort(
        (a, b) =>
            b.totalUsd - a.totalUsd ||
            a.vendor.localeCompare(b.vendor) ||
            a.service.localeCompare(b.service),
    );
}

export function sumApiCosts(costs: readonly ApiCost[]) {
    return costs.reduce(
        (total, row) => ({
            cashUsd: total.cashUsd + row.cashUsd,
            creditUsd: total.creditUsd + row.creditUsd,
            totalUsd: total.totalUsd + row.totalUsd,
        }),
        { cashUsd: 0, creditUsd: 0, totalUsd: 0 },
    );
}

export function infrastructureReport(
    data: Data,
    month: string,
    kind: "infrastructure" | "tools" = "infrastructure",
) {
    // Tools is a detail view of Infrastructure, never an additional category.
    // Shared Azure/Cloudflare bills need resource evidence before attribution.
    const rows = apiCosts(data, month).filter(
        (row) =>
            row.kind === "infrastructure" &&
            (kind === "infrastructure" ||
                row.vendor === "e2b" ||
                row.vendor === "exa"),
    );
    return {
        month,
        summary: rows.length ? sumApiCosts(rows) : null,
        rows,
    };
}
