import { Button, CopyButton, Dialog, Text, Tooltip } from "@pollinations/ui";
import { useState } from "react";
import { SourceLegendContent } from "./SourceLegend";

const COMMAND_GROUPS = [
    {
        title: "Ingest invoices",
        description:
            "Put PDFs in the input folder, then run one invoice pass. For backfill, copy old PDFs into the same input folder and run the same command.",
        commands: [
            {
                command: "python3 -m ingest.invoices.gmail --month 2026-07",
                label: "Gather Gmail PDFs",
                note: "Download invoice-like PDF attachments for one month into inbox/. No AI, no Tinybird.",
            },
            {
                command: "python3 -m ingest.invoices.run",
                label: "Analyze inbox",
                note: "Drain inbox/, append validated invoices, and move PDFs to validated/, quarantine/, or deleted/.",
            },
        ],
    },
    {
        title: "Update Tinybird",
        description:
            "Refresh operations tables after invoice files have been analyzed.",
        commands: [
            {
                command: "python3 -m ingest.run",
                label: "Refresh operations",
                note: "Update Wise payments, provider balances, meter usage, revenue, and grants.",
            },
        ],
    },
];

const FOLDERS = [
    "inbox/: input folder; should be empty after a run.",
    "validated/YYYY-MM/: confirmed invoice PDFs.",
    "quarantine/: files that need manual review.",
    "deleted/: confident non-invoices and duplicates.",
];

function CommandRow({
    command,
    label,
    note,
}: {
    command: string;
    label: string;
    note: string;
}) {
    return (
        <li className="grid gap-x-3 gap-y-1 rounded border border-theme-border/60 bg-theme-bg/30 px-3 py-2 lg:grid-cols-[11rem_minmax(24rem,30rem)_minmax(18rem,1fr)] lg:items-center">
            <div className="font-medium text-theme-text-strong">{label}</div>
            <div className="flex min-w-0 items-center gap-1.5">
                <code className="min-w-0 flex-1 rounded border border-theme-border/70 bg-theme-bg px-2 py-1 font-mono text-[11px] leading-5 text-theme-text-strong break-all sm:break-normal">
                    {command}
                </code>
                <CopyButton
                    value={command}
                    aria-label={`Copy ${label}`}
                    tooltip="Copy command"
                    copiedTooltip="Copied"
                    className="h-7 rounded border border-theme-border/70 px-2 text-xs text-theme-text-soft hover:bg-theme-bg-hover hover:text-theme-text-strong"
                >
                    copy
                </CopyButton>
            </div>
            <div className="leading-5 text-theme-text-soft">{note}</div>
        </li>
    );
}

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
                contentClassName="max-h-[88dvh] max-w-5xl"
            >
                <div className="max-h-[calc(88dvh-4rem)] overflow-y-auto p-6 pt-3 text-sm">
                    <section className="flex flex-col gap-4">
                        <div>
                            <div className="font-medium text-theme-text-strong">
                                Scripts
                            </div>
                            <Text as="div" size="sm" tone="soft">
                                Run commands from apps/operation/forager/. The
                                app only displays them; it does not trigger
                                external pipelines.
                            </Text>
                        </div>
                        {COMMAND_GROUPS.map((group) => (
                            <div
                                key={group.title}
                                className="flex flex-col gap-2"
                            >
                                <div>
                                    <div className="text-sm font-medium text-theme-text-strong">
                                        {group.title}
                                    </div>
                                    <div className="text-xs leading-5 text-theme-text-soft">
                                        {group.description}
                                    </div>
                                </div>
                                <ul className="flex flex-col gap-1">
                                    {group.commands.map((item) => (
                                        <CommandRow
                                            key={item.command}
                                            {...item}
                                        />
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </section>
                    <section className="mt-4 flex flex-col gap-2 border-theme-border/70 border-t pt-4">
                        <div className="font-medium text-theme-text-strong">
                            Invoice folders
                        </div>
                        <ul className="grid gap-x-6 gap-y-1 text-theme-text-soft md:grid-cols-2">
                            {FOLDERS.map((item) => (
                                <li key={item} className="flex gap-2">
                                    <span aria-hidden="true">-</span>
                                    <span>{item}</span>
                                </li>
                            ))}
                        </ul>
                    </section>
                    <section className="mt-4 rounded border border-intent-warning-text/40 bg-intent-warning-bg-light/20 p-3 text-sm leading-5 text-intent-warning-text">
                        Maintenance commands for Gmail harvest, archive import,
                        and usage/payment backfills exist in Forager, but they
                        are not part of the normal routine. Use them only when
                        intentionally repairing history.
                    </section>
                    <section className="mt-4 border-theme-border/70 border-t pt-4">
                        <div className="mb-2 font-medium text-theme-text-strong">
                            Source badges
                        </div>
                        <SourceLegendContent />
                    </section>
                    <div className="sticky bottom-0 mt-4 flex justify-end border-theme-border/70 border-t bg-surface-opaque pt-3">
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
