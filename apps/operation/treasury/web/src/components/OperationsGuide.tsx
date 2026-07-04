import { Button, CopyButton, Dialog, Text, Tooltip } from "@pollinations/ui";
import { useState } from "react";
import { SourceLegendContent } from "./SourceLegend";

const COMMANDS = [
    {
        command: "python3 -m ingest.run",
        label: "Daily refresh",
        note: "Harvests Gmail/inbox PDFs, skips invoice PDFs already known by SHA, and refreshes provider data, payments, balances, and reconciliation.",
    },
    {
        command: "python3 -m ingest.run --backfill-usage",
        label: "Backfill usage only",
        note: "Rebuilds usage_monthly from existing generation events. Does not harvest invoices, reparse archived PDFs, or run invoice AI extraction.",
    },
    {
        command: "python3 -m ingest.run --backfill",
        label: "Rebuild invoices from archive",
        note: "Dangerous maintenance path. Re-runs archive invoice extraction and replaces invoice-derived tables; read the forager runbook before using it.",
        danger: true,
    },
];

export function OperationsGuide() {
    const [open, setOpen] = useState(false);

    return (
        <>
            <Tooltip content="Operations guide">
                <Button
                    type="button"
                    size="sm"
                    onClick={() => setOpen(true)}
                    aria-label="Open operations guide"
                    className="h-7 w-7 px-0 pt-0 pb-0 text-xs font-bold"
                >
                    i
                </Button>
            </Tooltip>
            <Dialog
                open={open}
                onOpenChange={setOpen}
                title="Operations guide"
                size="lg"
            >
                <div className="flex flex-col gap-5 p-6 pt-3 text-sm">
                    <section className="flex flex-col gap-3">
                        <div>
                            <div className="font-medium text-theme-text-strong">
                                Invoice and database pipelines
                            </div>
                            <Text as="div" size="sm" tone="soft">
                                Run commands from apps/operation/forager/. The
                                app only displays them; it does not trigger
                                external pipelines.
                            </Text>
                        </div>
                        <div className="grid gap-2 lg:grid-cols-2">
                            {COMMANDS.map((item) => (
                                <div
                                    key={item.label}
                                    className={[
                                        "flex flex-col gap-1 rounded border p-3",
                                        item.danger
                                            ? "border-intent-warning-text/50 bg-intent-warning-bg-light/25"
                                            : "border-theme-border/70 bg-theme-bg/40",
                                    ].join(" ")}
                                >
                                    <div className="text-theme-text-strong">
                                        {item.label}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <code className="rounded border border-theme-border/70 bg-theme-bg px-2 py-1 text-xs">
                                            {item.command}
                                        </code>
                                        <CopyButton
                                            value={item.command}
                                            aria-label={`Copy ${item.label}`}
                                            tooltip="Copy command"
                                            copiedTooltip="Copied"
                                            className="h-7 rounded border border-theme-border/70 px-2 text-xs text-theme-text-soft hover:bg-theme-bg-hover hover:text-theme-text-strong"
                                        >
                                            copy
                                        </CopyButton>
                                    </div>
                                    <div className="text-theme-text-soft">
                                        {item.note}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                    <section className="border-theme-border/70 border-t pt-4">
                        <div className="mb-2 font-medium text-theme-text-strong">
                            Source badges
                        </div>
                        <SourceLegendContent />
                    </section>
                    <div className="flex justify-end">
                        <Button
                            type="button"
                            size="sm"
                            onClick={() => setOpen(false)}
                            className="h-7 self-end"
                        >
                            Close
                        </Button>
                    </div>
                </div>
            </Dialog>
        </>
    );
}
