import { Button, Input, Text } from "@pollinations/ui";
import { useState } from "react";
import { type StageInput, useStaging } from "../lib/staging";
import type { CoverageRow } from "../types";
import { UsageEntryForm } from "./UsageEntryForm";

const INBOX_PATH = "~/Documents/treasury-invoices/inbox/";
const INGEST_COMMAND = "python3 -m ingest.run";
const RESOLVABLE_STATUSES = new Set([
    "missing_invoice",
    "missing_payment",
    "amount_mismatch",
    "needs_review",
    "needs_label",
    "needs_data",
]);

function nowDateTime() {
    return new Date().toISOString().replace("T", " ").slice(0, 19);
}

export function canResolveGapStatus(status: string) {
    return RESOLVABLE_STATUSES.has(status);
}

export function buildAcceptChange({
    enteredAt = nowDateTime(),
    month,
    note,
    provider,
}: {
    enteredAt?: string;
    month: string;
    note: string;
    provider: string;
}): StageInput {
    return {
        datasource: "overrides",
        row: {
            entered_at: enteredAt,
            scope: "reconciliation",
            key: `${month}:${provider}`,
            field: "accepted",
            value_num: null,
            value_str: "1",
            note,
        },
        summary: `recon ${provider} ${month} accepted`,
    };
}

type Mode = "invoice" | "amount" | "accept";

export function GapActions({
    onClose,
    row,
}: {
    onClose: () => void;
    row: Pick<CoverageRow, "month" | "provider" | "status">;
}) {
    const { stage } = useStaging();
    const [mode, setMode] = useState<Mode>(
        row.status === "needs_data" ? "amount" : "invoice",
    );
    const [note, setNote] = useState("");

    return (
        <div className="flex flex-col gap-2 rounded border border-theme-border/70 bg-theme-bg/45 p-3">
            <div className="flex flex-wrap items-center gap-2">
                <Text as="span" size="sm" tone="soft">
                    what do you have for this month?
                </Text>
                <ModeButton
                    active={mode === "invoice"}
                    onClick={() => setMode("invoice")}
                >
                    the invoice
                </ModeButton>
                <ModeButton
                    active={mode === "amount"}
                    onClick={() => setMode("amount")}
                >
                    just a number
                </ModeButton>
                <ModeButton
                    active={mode === "accept"}
                    onClick={() => setMode("accept")}
                >
                    nothing
                </ModeButton>
                <button
                    type="button"
                    onClick={onClose}
                    className="ml-auto font-medium text-theme-link hover:underline"
                >
                    close
                </button>
            </div>

            {mode === "invoice" && (
                <div className="flex flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                        <Text as="span" size="sm" tone="soft">
                            Drop the PDF in
                        </Text>
                        <CopyChip value={INBOX_PATH} />
                        <Text as="span" size="sm" tone="soft">
                            then run
                        </Text>
                        <CopyChip value={INGEST_COMMAND} />
                    </div>
                    <Text size="sm" tone="soft">
                        This row clears on the next run.
                    </Text>
                </div>
            )}

            {mode === "amount" && (
                <UsageEntryForm
                    month={row.month}
                    provider={row.provider}
                    onStaged={onClose}
                />
            )}

            {mode === "accept" && (
                <form
                    className="flex flex-col gap-1.5"
                    onSubmit={(event) => {
                        event.preventDefault();
                        stage(
                            buildAcceptChange({
                                month: row.month,
                                note: note.trim(),
                                provider: row.provider,
                            }),
                        );
                        setNote("");
                        onClose();
                    }}
                >
                    <div className="flex flex-wrap items-center gap-2">
                        <Input
                            value={note}
                            onChange={(event) => setNote(event.target.value)}
                            placeholder="optional note"
                            className="w-64"
                        />
                        <Button type="submit" size="sm">
                            Stage accept
                        </Button>
                    </div>
                    <Text size="sm" tone="soft">
                        Marks the month as accepted — nothing to chase.
                    </Text>
                </form>
            )}
        </div>
    );
}

function ModeButton({
    active,
    children,
    onClick,
}: {
    active: boolean;
    children: string;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={[
                "rounded-full border px-3 py-1 text-sm transition-colors",
                active
                    ? "border-theme-link bg-theme-bg-hover font-medium text-theme-link"
                    : "border-theme-border/70 text-theme-text-soft hover:text-theme-text-strong",
            ].join(" ")}
        >
            {children}
        </button>
    );
}

function CopyChip({ value }: { value: string }) {
    const [copied, setCopied] = useState(false);

    return (
        <button
            type="button"
            title="Copy"
            onClick={() => {
                void navigator.clipboard?.writeText(value);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
            }}
            className="rounded border border-theme-border/70 bg-theme-bg px-2 py-0.5 font-mono text-xs text-theme-text-strong hover:bg-theme-bg-hover"
        >
            {copied ? "copied" : value}
        </button>
    );
}
