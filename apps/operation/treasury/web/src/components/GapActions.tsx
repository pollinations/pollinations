import { Button, Input, Text } from "@pollinations/ui";
import { useState } from "react";
import { type StageInput, useStaging } from "../lib/staging";
import type { CoverageRow } from "../types";
import { UsageEntryForm } from "./UsageEntryForm";

const INBOX_PATH = "~/Documents/treasury-invoices/inbox/";
const INGEST_COMMAND = "python3 -m ingest.run";
const RESOLVABLE_STATUSES = new Set([
    "missing_invoice",
    "amount_mismatch",
    "needs_review",
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

export function GapActions({
    onClose,
    row,
}: {
    onClose: () => void;
    row: Pick<CoverageRow, "month" | "provider" | "status">;
}) {
    const { stage } = useStaging();
    const [note, setNote] = useState("");

    return (
        <section className="rounded border border-theme-border/70 bg-theme-bg/45 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <Text weight="bold">
                        Resolve {row.provider} · {row.month}
                    </Text>
                    <Text size="sm" tone="soft">
                        Pick the evidence that exists. The row updates after the
                        next forager run.
                    </Text>
                </div>
                <Button size="sm" onClick={onClose}>
                    Close
                </Button>
            </div>

            <div className="mt-4 grid gap-3 xl:grid-cols-[1fr_1.5fr_1fr]">
                <div className="rounded border border-theme-border/70 bg-theme-bg/50 p-3">
                    <Text weight="bold">Ingest invoice</Text>
                    <Text size="sm" tone="soft" className="mt-1">
                        Put the PDF in the inbox, then run the forager ingest.
                    </Text>
                    <CopyLine label="path" value={INBOX_PATH} />
                    <CopyLine label="command" value={INGEST_COMMAND} />
                </div>

                <div className="rounded border border-theme-border/70 bg-theme-bg/50 p-3">
                    <Text weight="bold">Enter monthly usage</Text>
                    <Text size="sm" tone="soft" className="mt-1">
                        Use this when there is no invoice but the month's usage
                        or remaining grant value is known.
                    </Text>
                    <div className="mt-3">
                        <UsageEntryForm
                            month={row.month}
                            provider={row.provider}
                        />
                    </div>
                </div>

                <form
                    className="rounded border border-theme-border/70 bg-theme-bg/50 p-3"
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
                    <Text weight="bold">Accept</Text>
                    <Text size="sm" tone="soft" className="mt-1">
                        Use only when there is nothing meaningful to record for
                        this month.
                    </Text>
                    <Input
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        placeholder="optional note"
                        className="mt-3"
                    />
                    <Button type="submit" size="sm" className="mt-2">
                        Stage accept
                    </Button>
                </form>
            </div>
        </section>
    );
}

function CopyLine({ label, value }: { label: string; value: string }) {
    return (
        <div className="mt-3 flex items-center gap-2">
            <Text
                as="span"
                size="micro"
                tone="soft"
                weight="bold"
                className="w-16 uppercase"
            >
                {label}
            </Text>
            <code className="min-w-0 flex-1 truncate rounded bg-theme-bg px-2 py-1 text-xs">
                {value}
            </code>
            <Button
                type="button"
                size="sm"
                onClick={() => void navigator.clipboard?.writeText(value)}
            >
                Copy
            </Button>
        </div>
    );
}
