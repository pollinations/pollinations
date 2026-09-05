import type { Data } from "../types";
import { categoryLabel, transactionCategory } from "./categories";
import {
    type MonthFilterValue,
    matchesMonth,
    matchesValue,
    type ValueFilter,
    WINDOW_START,
} from "./months";
import { resolveProvider } from "./providerRegistry";

export type LedgerTab =
    | "op-transactions"
    | "op-pollen"
    | "op-cloud"
    | "revenue-share-ledger";

export type FacetOption = {
    value: string;
    label: string;
    count?: number;
};

export type LedgerFacets = {
    vendors: FacetOption[];
    categories: FacetOption[];
};

type LedgerFacetSelection = {
    month: MonthFilterValue;
    vendors: ValueFilter;
    categories: ValueFilter;
};

function selectedValues(value: ValueFilter): readonly string[] {
    if (typeof value !== "string") return value;
    return value && value !== "all" ? [value] : [];
}

function countedOptions(
    values: readonly string[],
    selected: ValueFilter,
    label: (value: string) => string,
): FacetOption[] {
    const counts = new Map<string, number>();
    for (const value of values) {
        const normalized = value.trim();
        if (!normalized) continue;
        counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
    for (const value of selectedValues(selected)) {
        if (value) counts.set(value, counts.get(value) ?? 0);
    }
    return [...counts]
        .map(([value, count]) => ({ value, label: label(value), count }))
        .sort(
            (a, b) =>
                a.label.localeCompare(b.label, undefined, {
                    numeric: true,
                    sensitivity: "base",
                }) || a.value.localeCompare(b.value),
        );
}

function vendorLabel(value: string): string {
    return resolveProvider(value)?.label ?? `Unmapped · ${value}`;
}

export function ledgerFacets(
    data: Data,
    tab: LedgerTab,
    selection: LedgerFacetSelection,
): LedgerFacets {
    if (tab === "revenue-share-ledger") {
        return { vendors: [], categories: [] };
    }

    if (tab === "op-transactions") {
        const rows = (data.opTransactions ?? []).filter(
            (row) =>
                row.date.slice(0, 7) >= WINDOW_START &&
                matchesMonth(row.date, selection.month),
        );
        const vendorRows = rows.filter((row) =>
            matchesValue(transactionCategory(row), selection.categories),
        );
        const categoryRows = rows.filter((row) =>
            matchesValue(row.vendor, selection.vendors),
        );
        return {
            vendors: countedOptions(
                vendorRows.map((row) => row.vendor),
                selection.vendors,
                (value) => value,
            ),
            categories: countedOptions(
                categoryRows.map(transactionCategory),
                selection.categories,
                categoryLabel,
            ),
        };
    }

    if (tab === "op-cloud") {
        const rows = (data.opCloud ?? []).filter(
            (row) =>
                row.start.slice(0, 7) >= WINDOW_START &&
                matchesMonth(row.start, selection.month),
        );
        return {
            vendors: countedOptions(
                rows.map((row) => row.vendor),
                selection.vendors,
                vendorLabel,
            ),
            categories: [],
        };
    }

    const rows = (data.opPollen ?? []).filter(
        (row) =>
            row.month >= WINDOW_START &&
            matchesMonth(row.month, selection.month),
    );
    return {
        vendors: countedOptions(
            rows.map((row) => row.vendor),
            selection.vendors,
            vendorLabel,
        ),
        categories: [],
    };
}
