import { Alert, Dialog, Text } from "@pollinations/ui";
import { useEffect, useState } from "react";
import { useStaging } from "../lib/staging";
import { HeaderButton } from "./HeaderButton";

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
        <HeaderButton
            disabled={disabled}
            onClick={onClick}
            title="Review and commit pending changes"
            tone="success"
            icon={<DiskIcon className="h-3.5 w-3.5" />}
        >
            {label}
        </HeaderButton>
    );
}

// Header-level pending-changes controls: everything edited anywhere in the
// app lands in one pending pool; Save confirms and commits it, Reset drops it.
export function SaveControls() {
    const { changes, clear, commitAll, committing, error } = useStaging();
    const [confirmOpen, setConfirmOpen] = useState(false);
    const visibleChanges = changes.filter((change) => !change.hidden);
    const count = changes.length;
    const visibleCount = visibleChanges.length;

    // commit succeeded -> pool empty -> close the modal
    useEffect(() => {
        if (confirmOpen && count === 0 && !committing) setConfirmOpen(false);
    }, [confirmOpen, count, committing]);

    return (
        <>
            <HeaderButton
                disabled={count === 0 || committing}
                onClick={clear}
                title="Drop every pending change"
                tone="danger"
            >
                Reset
            </HeaderButton>
            <SaveButton
                disabled={count === 0 || committing}
                onClick={() => setConfirmOpen(true)}
                label={visibleCount > 0 ? `Save · ${visibleCount}` : "Save"}
            />
            <Dialog
                open={confirmOpen}
                onOpenChange={setConfirmOpen}
                title="Save changes"
                size="sm"
            >
                <div className="flex flex-col gap-3 p-6 pt-3">
                    <ul className="max-h-48 overflow-y-auto text-sm">
                        {visibleChanges.map((change) => (
                            <li
                                key={change.id}
                                className="truncate border-theme-border/60 border-t py-1.5 first:border-t-0"
                            >
                                {change.summary}
                            </li>
                        ))}
                    </ul>
                    <Text size="sm" tone="soft">
                        Appends rows to Tinybird now. Views built from overrides
                        update after the next forager run.
                    </Text>
                    {error && <Alert intent="warning">{error}</Alert>}
                    <div className="flex justify-end gap-2">
                        <HeaderButton
                            onClick={() => setConfirmOpen(false)}
                            disabled={committing}
                            tone="neutral"
                        >
                            Cancel
                        </HeaderButton>
                        <HeaderButton
                            onClick={() => void commitAll()}
                            disabled={committing}
                            tone="success"
                        >
                            {committing
                                ? "Saving..."
                                : `Confirm ${visibleCount}`}
                        </HeaderButton>
                    </div>
                </div>
            </Dialog>
        </>
    );
}
