import { Alert, Button, Input, Text } from "@pollinations/ui";
import type { ReactNode } from "react";
import { useState } from "react";
import { type StageInput, useStaging } from "../lib/staging";
import type { InvoiceRow } from "../types";

export const INVOICE_KINDS = [
    "prepaid_topup",
    "subscription",
    "monthly_bill",
    "payg",
    "reseller",
    "not_invoice",
];

export const INVOICE_CATEGORIES = [
    "compute",
    "infra",
    "saas",
    "payroll",
    "other",
];

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type InvoiceEditValues = {
    amount: string;
    category: string;
    creditUsd: string;
    currency: string;
    invoiceNumber: string;
    issuedAt: string;
    kind: string;
    periodMonth: string;
};

function nowDateTime() {
    return new Date().toISOString().replace("T", " ").slice(0, 19);
}

export function initialInvoiceValues(row: InvoiceRow): InvoiceEditValues {
    return {
        amount: row.amount.toString(),
        category: row.category || "other",
        creditUsd: row.credit_usd.toString(),
        currency: row.currency || "USD",
        invoiceNumber: row.invoice_number || "",
        issuedAt:
            row.issued_at || (row.period_month ? `${row.period_month}-01` : ""),
        kind: row.kind || "monthly_bill",
        periodMonth: row.period_month || "",
    };
}

export function validateInvoiceEdit(values: InvoiceEditValues): string | null {
    if (!MONTH_RE.test(values.periodMonth)) {
        return "period_month must be YYYY-MM";
    }
    if (!["USD", "EUR"].includes(values.currency)) {
        return "currency must be USD or EUR";
    }
    if (!INVOICE_KINDS.includes(values.kind)) {
        return "kind is not valid";
    }
    if (!INVOICE_CATEGORIES.includes(values.category)) {
        return "category is not valid";
    }
    if (values.issuedAt && !DATE_RE.test(values.issuedAt)) {
        return "issued_at must be YYYY-MM-DD";
    }

    const amount = Number(values.amount);
    if (!Number.isFinite(amount) || amount < 0) {
        return "amount due must be >= 0";
    }

    const creditUsd = Number(values.creditUsd);
    if (!Number.isFinite(creditUsd) || creditUsd < 0) {
        return "credits applied must be >= 0";
    }

    return null;
}

export function buildInvoiceLabelChange({
    ingestedAt = nowDateTime(),
    row,
    values,
}: {
    ingestedAt?: string;
    row: InvoiceRow;
    values: InvoiceEditValues;
}): StageInput {
    return {
        datasource: "invoices",
        row: {
            sha256: row.sha256,
            provider: row.provider,
            category: values.category,
            kind: values.kind,
            period_month: values.periodMonth,
            amount: Number(values.amount),
            currency: values.currency,
            invoice_number: values.invoiceNumber,
            issued_at: values.issuedAt || `${values.periodMonth}-01`,
            source: "label",
            file_ref: row.file_ref,
            status: "parsed",
            ingested_at: ingestedAt,
            credit_usd: Number(values.creditUsd),
        },
        summary: `invoice ${row.provider} ${values.periodMonth} label`,
    };
}

export function buildInvoiceIgnoreChange({
    ingestedAt = nowDateTime(),
    reason,
    row,
}: {
    ingestedAt?: string;
    reason: string;
    row: InvoiceRow;
}): StageInput {
    return {
        datasource: "invoices",
        row: {
            sha256: row.sha256,
            provider: row.provider || "other",
            category: row.category || "other",
            kind: "not_invoice",
            period_month: "",
            amount: 0,
            currency: row.currency || "USD",
            invoice_number: reason,
            issued_at: row.issued_at || "1970-01-01",
            source: "label",
            file_ref: row.file_ref,
            status: "ignored",
            ingested_at: ingestedAt,
            credit_usd: 0,
        },
        summary: `invoice ${row.provider || "other"} ignored`,
    };
}

export function InvoiceEditor({
    onClose,
    row,
}: {
    onClose: () => void;
    row: InvoiceRow;
}) {
    const { stage } = useStaging();
    const [values, setValues] = useState(() => initialInvoiceValues(row));
    const [ignoreReason, setIgnoreReason] = useState("");
    const [error, setError] = useState<string | null>(null);

    const update = (key: keyof InvoiceEditValues, value: string) => {
        setValues((current) => ({ ...current, [key]: value }));
    };

    return (
        <div className="flex flex-col gap-3 rounded border border-theme-border/70 bg-theme-bg/60 p-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Text weight="bold">label invoice</Text>
                <Text tone="soft">{row.provider || "other"}</Text>
                <Text tone="soft" className="font-mono">
                    {row.sha256.slice(0, 12)}
                </Text>
            </div>
            {error && <Alert intent="warning">{error}</Alert>}
            <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(event) => {
                    event.preventDefault();
                    const validation = validateInvoiceEdit(values);
                    if (validation) {
                        setError(validation);
                        return;
                    }
                    stage(buildInvoiceLabelChange({ row, values }));
                    onClose();
                }}
            >
                <Field label="kind">
                    <select
                        value={values.kind}
                        onChange={(event) => update("kind", event.target.value)}
                        className="rounded border border-theme-border/70 bg-theme-bg px-2 py-1 text-theme-text-strong"
                    >
                        {INVOICE_KINDS.map((kind) => (
                            <option key={kind} value={kind}>
                                {kind}
                            </option>
                        ))}
                    </select>
                </Field>
                <Field label="category">
                    <select
                        value={values.category}
                        onChange={(event) =>
                            update("category", event.target.value)
                        }
                        className="rounded border border-theme-border/70 bg-theme-bg px-2 py-1 text-theme-text-strong"
                    >
                        {INVOICE_CATEGORIES.map((category) => (
                            <option key={category} value={category}>
                                {category}
                            </option>
                        ))}
                    </select>
                </Field>
                <Field label="amount due">
                    <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={values.amount}
                        onChange={(event) =>
                            update("amount", event.target.value)
                        }
                        className="w-28"
                    />
                </Field>
                <Field label="credits applied">
                    <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={values.creditUsd}
                        onChange={(event) =>
                            update("creditUsd", event.target.value)
                        }
                        className="w-28"
                    />
                </Field>
                <Field label="currency">
                    <select
                        value={values.currency}
                        onChange={(event) =>
                            update("currency", event.target.value)
                        }
                        className="rounded border border-theme-border/70 bg-theme-bg px-2 py-1 text-theme-text-strong"
                    >
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                    </select>
                </Field>
                <Field label="period_month">
                    <Input
                        value={values.periodMonth}
                        onChange={(event) =>
                            update("periodMonth", event.target.value)
                        }
                        placeholder="YYYY-MM"
                        className="w-28"
                    />
                </Field>
                <Field label="issued_at">
                    <Input
                        type="date"
                        value={values.issuedAt}
                        onChange={(event) =>
                            update("issuedAt", event.target.value)
                        }
                        className="w-36"
                    />
                </Field>
                <Field label="invoice_number">
                    <Input
                        value={values.invoiceNumber}
                        onChange={(event) =>
                            update("invoiceNumber", event.target.value)
                        }
                        className="w-40"
                    />
                </Field>
                <Button type="submit" size="sm">
                    Stage label
                </Button>
                <Button type="button" size="sm" onClick={onClose}>
                    Cancel
                </Button>
            </form>
            <form
                className="flex flex-wrap items-end gap-2 border-theme-border/60 border-t pt-3"
                onSubmit={(event) => {
                    event.preventDefault();
                    stage(
                        buildInvoiceIgnoreChange({
                            reason: ignoreReason.trim(),
                            row,
                        }),
                    );
                    onClose();
                }}
            >
                <Field label="ignore reason">
                    <Input
                        value={ignoreReason}
                        onChange={(event) =>
                            setIgnoreReason(event.target.value)
                        }
                        placeholder="not an invoice"
                        className="w-64"
                    />
                </Field>
                <Button type="submit" size="sm">
                    Ignore
                </Button>
            </form>
        </div>
    );
}

function Field({ children, label }: { children: ReactNode; label: string }) {
    return (
        <div className="flex flex-col gap-1 text-xs text-theme-text-soft">
            <span>{label}</span>
            {children}
        </div>
    );
}
