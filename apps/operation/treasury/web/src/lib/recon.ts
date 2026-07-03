export type ChipIntent = "news" | "alpha" | "neutral" | "warning" | "danger";

export type StatusMeta = {
    label: string;
    intent: ChipIntent | null;
    severity: number;
};

export const STATUS_META: Record<string, StatusMeta> = {
    ok: { label: "ok", intent: null, severity: 0 },
    accepted: { label: "accepted", intent: null, severity: 0 },
    ok_credit: { label: "credit", intent: "news", severity: 0 },
    needs_data: { label: "no data", intent: "neutral", severity: 1 },
    needs_review: { label: "review", intent: "alpha", severity: 2 },
    needs_label: { label: "needs label", intent: "alpha", severity: 2 },
    amount_mismatch: { label: "mismatch", intent: "warning", severity: 3 },
    missing_payment: { label: "no payment", intent: "danger", severity: 4 },
    missing_invoice: { label: "no invoice", intent: "danger", severity: 4 },
};

export const statusMeta = (s: string): StatusMeta =>
    STATUS_META[s] ?? { label: s, intent: "warning", severity: 3 };
