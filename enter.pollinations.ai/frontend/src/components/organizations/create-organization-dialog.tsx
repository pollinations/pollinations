import { Button, Dialog, DialogTitle, Field, Input } from "@pollinations/ui";
import type { FC, ReactNode } from "react";
import { useState } from "react";
import type { OrganizationSummary } from "./types.ts";

type CreateOrganizationDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreate: (name: string) => Promise<OrganizationSummary>;
    onCreated: (organization: OrganizationSummary) => void;
    trigger?: ReactNode;
};

export const CreateOrganizationDialog: FC<CreateOrganizationDialogProps> = ({
    open,
    onOpenChange,
    onCreate,
    onCreated,
    trigger,
}) => {
    const [name, setName] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!name.trim() || isSubmitting) return;
        setIsSubmitting(true);
        setError(null);
        try {
            const organization = await onCreate(name.trim());
            onCreated(organization);
            setName("");
            onOpenChange(false);
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Failed to create organization",
            );
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (next) {
                    setName("");
                    setError(null);
                }
                onOpenChange(next);
            }}
            size="md"
            trigger={trigger}
            triggerAsChild={!!trigger}
        >
            <div className="p-6 pb-4">
                <DialogTitle className="text-lg font-semibold">
                    Create Organization
                </DialogTitle>
                <p className="mt-1 text-sm text-theme-text-muted">
                    Invite members to help fund and use models through a shared,
                    paid-only Pollen balance. Organizations don't receive Quest
                    Pollen.
                </p>
            </div>
            <form
                onSubmit={handleSubmit}
                className="flex flex-col gap-4 px-6 pb-6"
            >
                {error && (
                    <p className="text-sm text-intent-danger-text bg-intent-danger-bg-light px-3 py-2 rounded-lg">
                        {error}
                    </p>
                )}
                <Field.Root className="flex flex-col gap-2">
                    <Field.Label className="text-sm font-semibold">
                        Name
                    </Field.Label>
                    <Input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Acme Inc"
                        required
                        autoFocus
                        disabled={isSubmitting}
                    />
                </Field.Root>
                <div className="flex justify-end gap-2 pt-2">
                    <Button
                        type="button"
                        intent="danger"
                        onClick={() => onOpenChange(false)}
                        disabled={isSubmitting}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        className="disabled:opacity-50"
                        disabled={!name.trim() || isSubmitting}
                    >
                        {isSubmitting ? "Creating..." : "Create"}
                    </Button>
                </div>
            </form>
        </Dialog>
    );
};
