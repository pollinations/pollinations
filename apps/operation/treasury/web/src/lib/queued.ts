import type { StagedChange } from "./staging";

export const queuedReconKey = (month: string, provider: string) =>
    `recon:${month}:${provider}`;

export const queuedMeterKey = (month: string, provider: string) =>
    `meter_monthly:${month}:${provider}`;

export const queuedInvoiceKey = (sha256: string) => `invoices:${sha256}`;

export const queuedPaymentRuleKey = (counterparty: string) =>
    `payments:${counterparty}`;

function stringValue(value: unknown) {
    return typeof value === "string" ? value : "";
}

export function queuedKeysForChange(change: StagedChange): string[] {
    const row = change.row;

    if (change.datasource === "overrides") {
        const scope = stringValue(row.scope);
        const key = stringValue(row.key);
        if (scope === "reconciliation") {
            const [month, provider] = key.split(":");
            return month && provider ? [queuedReconKey(month, provider)] : [];
        }
        if (scope === "payments") {
            return key ? [queuedPaymentRuleKey(key)] : [];
        }
        return [];
    }

    if (change.datasource === "meter_monthly") {
        const month = stringValue(row.month);
        const provider = stringValue(row.provider);
        return month && provider
            ? [queuedMeterKey(month, provider), queuedReconKey(month, provider)]
            : [];
    }

    if (change.datasource === "invoices") {
        const sha256 = stringValue(row.sha256);
        return sha256 ? [queuedInvoiceKey(sha256)] : [];
    }

    return [];
}
