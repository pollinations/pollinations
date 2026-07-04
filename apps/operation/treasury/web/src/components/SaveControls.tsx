import { Alert, Dialog, Text } from "@pollinations/ui";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useStaging } from "../lib/staging";

function DiskIcon({ className }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            aria-hidden="true"
            role="presentation"
        >
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <path d="M17 21v-8H7v8" />
            <path d="M7 3v5h8" />
        </svg>
    );
}

// App-side buttons: the package Button has no success recipe and its theme
// background would fight a green fill, so the save/reset pair is styled here
// with the design-system traffic-light tokens.
function ActionButton({
    children,
    className,
    disabled,
    onClick,
    title,
}: {
    children: ReactNode;
    className: string;
    disabled?: boolean;
    onClick: () => void;
    title?: string;
}) {
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            title={title}
            className={[
                "inline-flex h-7 items-center justify-center gap-1.5 rounded-full px-3 pt-0.5 pb-1 text-sm font-medium transition-colors",
                disabled
                    ? "cursor-not-allowed opacity-50"
                    : "cursor-pointer hover:brightness-105",
                className,
            ].join(" ")}
        >
            {children}
        </button>
    );
}

export function SaveButton({
    disabled,
    label,
    onClick,
}: {
    disabled?: boolean;
    label: string;
    onClick: () => void;
}) {
    return (
        <ActionButton
            disabled={disabled}
            onClick={onClick}
            title="Review and commit pending changes"
            className="bg-intent-success-bg-bright text-intent-success-text-on-bright"
        >
            <DiskIcon className="h-3.5 w-3.5" />
            {label}
        </ActionButton>
    );
}

// Header-level pending-changes controls: everything edited anywhere in the
// app lands in one pending pool; Save confirms and commits it, Reset drops it.
export function SaveControls() {
    const { changes, clear, commitAll, committing, error } = useStaging();
    const [confirmOpen, setConfirmOpen] = useState(false);
    const count = changes.length;

    // commit succeeded -> pool empty -> close the modal
    useEffect(() => {
        if (confirmOpen && count === 0 && !committing) setConfirmOpen(false);
    }, [confirmOpen, count, committing]);

    return (
        <>
            <ActionButton
                disabled={count === 0 || committing}
                onClick={clear}
                title="Drop every pending change"
                className="bg-transparent text-intent-danger-text hover:bg-intent-danger-bg-light"
            >
                Reset
            </ActionButton>
            <SaveButton
                disabled={count === 0 || committing}
                onClick={() => setConfirmOpen(true)}
                label={count > 0 ? `Save · ${count}` : "Save"}
            />
            <Dialog
                open={confirmOpen}
                onOpenChange={setConfirmOpen}
                title="Save changes"
                size="sm"
            >
                <div className="flex flex-col gap-3 p-6 pt-3">
                    <ul className="max-h-48 overflow-y-auto text-sm">
                        {changes.map((change) => (
                            <li
                                key={change.id}
                                className="truncate border-theme-border/60 border-t py-1.5 first:border-t-0"
                            >
                                {change.summary}
                            </li>
                        ))}
                    </ul>
                    <Text size="sm" tone="soft">
                        Appends raw rows to Tinybird now; derived flags update
                        after the next forager run.
                    </Text>
                    {error && <Alert intent="warning">{error}</Alert>}
                    <div className="flex justify-end gap-2">
                        <ActionButton
                            onClick={() => setConfirmOpen(false)}
                            disabled={committing}
                            className="bg-transparent text-theme-text-soft hover:bg-theme-bg-hover"
                        >
                            Cancel
                        </ActionButton>
                        <ActionButton
                            onClick={() => void commitAll()}
                            disabled={committing}
                            className="bg-intent-success-bg-bright text-intent-success-text-on-bright"
                        >
                            {committing ? "Saving..." : `Confirm ${count}`}
                        </ActionButton>
                    </div>
                </div>
            </Dialog>
        </>
    );
}
