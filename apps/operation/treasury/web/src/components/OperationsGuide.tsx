import { CopyButton, Dialog, Text, Tooltip } from "@pollinations/ui";
import { useState } from "react";
import { HeaderButton } from "./HeaderButton";
import { SourceLegendContent } from "./SourceLegend";

const UPDATE_COMMAND = "python3 -m ingest.run";

function CommandBlock() {
    return (
        <div className="grid gap-2 md:grid-cols-[8rem_minmax(0,1fr)]">
            <div>
                <div className="font-medium text-theme-text-strong">
                    Refresh data
                </div>
                <div className="mt-0.5 text-xs leading-5 text-theme-text-soft">
                    Run from <code>apps/operation/forager/</code>.
                </div>
            </div>
            <div className="flex min-w-0 items-start gap-1.5">
                <code className="min-w-0 flex-1 rounded border border-theme-border/70 bg-theme-bg px-2 py-1 font-mono text-[11px] leading-5 text-theme-text-strong break-all sm:break-normal">
                    {UPDATE_COMMAND}
                </code>
                <CopyButton
                    value={UPDATE_COMMAND}
                    aria-label="Copy refresh data command"
                    tooltip="Copy command"
                    copiedTooltip="Copied"
                    className="h-7 rounded border border-theme-border/70 px-2 text-xs text-theme-text-soft hover:bg-theme-bg-hover hover:text-theme-text-strong"
                >
                    copy
                </CopyButton>
            </div>
        </div>
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
            <Tooltip content="Operations guide" triggerAs="span">
                <HeaderButton
                    label="Open operations guide"
                    title="Open operations guide"
                    tone="info"
                    icon={<InfoIcon />}
                    onClick={() => setOpen(true)}
                >
                    Info
                </HeaderButton>
            </Tooltip>
            <Dialog
                open={open}
                onOpenChange={setOpen}
                title="Operations guide"
                size="md"
                contentClassName="max-h-[88dvh] max-w-2xl"
            >
                <div className="max-h-[calc(88dvh-4rem)] overflow-y-auto p-6 pt-3 text-sm">
                    <section className="flex flex-col gap-3">
                        <Text as="p" size="sm" tone="soft">
                            This app is a read-only mirror of the Tinybird{" "}
                            <code>operations</code> workspace. Refresh the data
                            after updating source exports by running the command
                            below. Corrections (manual rows, aliases, scoped
                            reruns) happen in the forager runbook at{" "}
                            <code>apps/operation/forager/AGENTS.md</code>.
                        </Text>
                        <CommandBlock />
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
