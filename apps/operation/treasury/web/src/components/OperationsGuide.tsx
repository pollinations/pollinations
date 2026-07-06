import { CopyButton, Dialog, Text, Tooltip } from "@pollinations/ui";
import { useState } from "react";
import { HeaderButton } from "./HeaderButton";
import { SourceLegendContent } from "./SourceLegend";

const COMMAND_GROUPS = [
    {
        title: "Update Tinybird",
        description:
            "Refresh operations tables after dropping the monthly Enty export folder.",
        commands: [
            {
                command: "python3 -m ingest.run",
                label: "Refresh operations",
                note: "Update Enty transactions, provider usage, platform usage, and revenue.",
            },
            {
                command:
                    "python3 apps/operation/_local/invoice-fetcher/fetch_gog_invoices.py --month 2026-07",
                label: "Fetch invoice PDFs",
                note: "Local-only helper: set GOG_ACCOUNT or pass --account to download invoice-like Gmail PDFs into the invoice inbox. No AI, no Tinybird.",
            },
        ],
    },
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
        <li className="grid gap-2 border-theme-border/60 border-t py-3 first:border-t-0 md:grid-cols-[9rem_minmax(0,1fr)]">
            <div>
                <div className="font-medium text-theme-text-strong">
                    {label}
                </div>
                <div className="mt-0.5 text-xs leading-5 text-theme-text-soft">
                    {note}
                </div>
            </div>
            <div className="flex min-w-0 items-start gap-1.5">
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
        </li>
    );
}

function InfoIcon() {
    return (
        <span
            aria-hidden="true"
            className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-current/40 text-[11px] font-black leading-none"
        >
            i
        </span>
    );
}

export function OperationsGuide() {
    const [open, setOpen] = useState(false);

    return (
        <>
            <Tooltip content="Operations guide">
                <span>
                    <HeaderButton
                        label="Open operations guide"
                        title="Open operations guide"
                        tone="info"
                        icon={<InfoIcon />}
                        onClick={() => setOpen(true)}
                    >
                        Info
                    </HeaderButton>
                </span>
            </Tooltip>
            <Dialog
                open={open}
                onOpenChange={setOpen}
                title="Operations guide"
                size="lg"
                contentClassName="max-h-[88dvh] max-w-3xl"
            >
                <div className="max-h-[calc(88dvh-4rem)] overflow-y-auto p-6 pt-3 text-sm">
                    <section className="flex flex-col gap-5">
                        <Text as="p" size="sm" tone="soft">
                            Run Forager commands from{" "}
                            <code>apps/operation/forager/</code>. Local helper
                            commands run from the repo root. The app shows the
                            routine workflow; it does not execute scripts.
                        </Text>
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
                    <section className="mt-5 grid gap-3 border-theme-border/70 border-t pt-5 md:grid-cols-[9rem_1fr]">
                        <div className="font-medium text-theme-text-strong">
                            Source badges
                        </div>
                        <SourceLegendContent />
                    </section>
                    <div className="sticky bottom-0 mt-4 flex justify-end border-theme-border/70 border-t bg-surface-opaque pt-3">
                        <HeaderButton
                            onClick={() => setOpen(false)}
                            tone="neutral"
                        >
                            Close
                        </HeaderButton>
                    </div>
                </div>
            </Dialog>
        </>
    );
}
