import {
    Alert,
    Button,
    Chip,
    CopyButton,
    Dialog,
    FieldStack,
    GitHubIcon,
    Heading,
    Input,
    LockIcon,
    Section,
    Surface,
    Text,
} from "@pollinations/ui";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { authClient } from "../auth.ts";
import { Route as DashboardRoute } from "./_dashboard.tsx";

const DELETE_CONFIRMATION = "DELETE";

export const Route = createFileRoute("/_dashboard/account")({
    beforeLoad: ({ context, location }) => {
        if (!context.user) {
            throw redirect({
                to: "/sign-in",
                search: { next: location.href },
            });
        }
    },
    component: AccountPage,
});

function AccountPage() {
    const { user, githubUsername } = DashboardRoute.useLoaderData();
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

    if (!user) return null;

    const displayName = user.name || githubUsername || "Pollinations user";
    const avatarUrl = user.image || "";

    return (
        <div className="flex flex-col gap-6">
            <Section title="Profile" framed>
                <div>
                    <div className="flex items-center gap-4">
                        {avatarUrl ? (
                            <img
                                src={avatarUrl}
                                alt={`${displayName} avatar`}
                                className="h-16 w-16 shrink-0 rounded-full"
                            />
                        ) : (
                            <div
                                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-surface-opaque text-theme-text-muted"
                                aria-hidden="true"
                            >
                                <GitHubIcon className="h-7 w-7" />
                            </div>
                        )}
                        <div className="min-w-0">
                            <Heading as="h3" size="subsection">
                                {displayName}
                            </Heading>
                            {githubUsername && (
                                <a
                                    href={`https://github.com/${encodeURIComponent(githubUsername)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm text-theme-text-base transition-colors hover:text-theme-text-strong"
                                >
                                    @{githubUsername}
                                </a>
                            )}
                            <Text size="sm" tone="muted" className="truncate">
                                {user.email}
                            </Text>
                        </div>
                    </div>
                    <Surface
                        variant="card"
                        className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                    >
                        <div>
                            <Text tone="strong" weight="semibold">
                                Pollinations ID
                            </Text>
                            <Text size="sm" tone="muted">
                                Your unique account identifier.
                            </Text>
                        </div>
                        <CopyButton
                            value={user.id}
                            tooltip={null}
                            aria-label="Copy Pollinations ID"
                            className="flex max-w-full items-center gap-2 rounded-lg bg-theme-bg-pale px-3 py-2 text-left font-mono text-xs text-theme-text-base transition-colors hover:text-theme-text-strong"
                        >
                            {(copied) => (
                                <>
                                    <span className="truncate">{user.id}</span>
                                    <span className="shrink-0 font-sans font-medium">
                                        {copied ? "Copied" : "Copy"}
                                    </span>
                                </>
                            )}
                        </CopyButton>
                    </Surface>
                    <div className="mt-4 space-y-2 border-t border-divider pt-4 text-[13px] leading-snug text-theme-text-muted">
                        <p className="flex items-start gap-1.5">
                            <GitHubIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>
                                Your profile details come from your connected
                                GitHub account.
                            </span>
                        </p>
                    </div>
                </div>
            </Section>

            <Section title="Connected accounts" framed>
                <Surface variant="card" className="flex items-center gap-3">
                    <GitHubIcon className="h-6 w-6 shrink-0 text-theme-text-strong" />
                    <div className="min-w-0 flex-1">
                        <Text tone="strong" weight="semibold">
                            GitHub
                        </Text>
                        <Text size="sm" tone="muted" className="truncate">
                            {githubUsername ? `@${githubUsername}` : user.email}
                        </Text>
                    </div>
                    <Chip intent="neutral" size="sm">
                        Connected
                    </Chip>
                </Surface>
            </Section>

            <Section title="Danger zone" framed>
                <div>
                    <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                        <Text tone="strong" weight="semibold">
                            Delete Pollinations account
                        </Text>
                        <Button
                            type="button"
                            intent="danger"
                            className="shrink-0 self-start sm:self-center"
                            onClick={() => setDeleteDialogOpen(true)}
                        >
                            Delete account
                        </Button>
                    </div>
                    <div className="mt-4 space-y-2 border-t border-divider pt-4 text-[13px] leading-snug text-theme-text-muted">
                        <p className="flex items-start gap-1.5">
                            <LockIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>
                                Permanently remove your account and revoke
                                access.
                            </span>
                        </p>
                    </div>
                </div>
            </Section>

            <DeleteAccountDialog
                open={deleteDialogOpen}
                onOpenChange={setDeleteDialogOpen}
            />
        </div>
    );
}

type DeleteAccountDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

function DeleteAccountDialog({ open, onOpenChange }: DeleteAccountDialogProps) {
    const [confirmation, setConfirmation] = useState("");
    const [isDeleting, setIsDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    function handleOpenChange(nextOpen: boolean): void {
        if (isDeleting) return;
        if (!nextOpen) {
            setConfirmation("");
            setError(null);
        }
        onOpenChange(nextOpen);
    }

    async function handleDelete(): Promise<void> {
        if (confirmation !== DELETE_CONFIRMATION || isDeleting) return;

        setIsDeleting(true);
        setError(null);

        const result = await authClient.deleteUser();
        if (result.error) {
            const message = result.error.message || "Account deletion failed.";
            setError(
                /fresh|expired/i.test(message)
                    ? "For security, sign out and sign in again before deleting your account."
                    : message,
            );
            setIsDeleting(false);
            return;
        }

        window.location.assign("/news");
    }

    return (
        <Dialog
            open={open}
            onOpenChange={handleOpenChange}
            title="Delete Pollinations account?"
            size="sm"
        >
            <div className="mt-4 flex flex-col gap-5 px-6 pb-6">
                <Alert intent="danger" title="This cannot be undone">
                    <div className="flex flex-col gap-3">
                        <p>Deleting your Pollinations account removes:</p>
                        <ul className="list-disc space-y-1 pl-5">
                            <li>
                                Profile, Pollinations ID, sessions, GitHub
                                connection, and API keys
                            </li>
                            <li>
                                Pollen balances, rewards, agents, and community
                                models
                            </li>
                            <li>Published media listings and tags</li>
                        </ul>
                        <p>
                            Cached copies of uploaded and generated media may
                            remain temporarily until their retention period
                            ends. Required billing and usage records may also be
                            retained.
                        </p>
                    </div>
                </Alert>

                <FieldStack
                    label={
                        <>
                            Type{" "}
                            <span className="font-mono font-semibold text-intent-danger-text">
                                DELETE
                            </span>{" "}
                            to confirm
                        </>
                    }
                    error={error}
                >
                    <Input
                        value={confirmation}
                        onChange={(event) =>
                            setConfirmation(event.currentTarget.value)
                        }
                        autoComplete="off"
                        spellCheck={false}
                        disabled={isDeleting}
                    />
                </FieldStack>

                <div className="flex justify-end gap-2">
                    <Button
                        type="button"
                        onClick={() => handleOpenChange(false)}
                        disabled={isDeleting}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        intent="danger"
                        onClick={() => void handleDelete()}
                        disabled={
                            confirmation !== DELETE_CONFIRMATION || isDeleting
                        }
                    >
                        {isDeleting ? "Deleting..." : "Delete account"}
                    </Button>
                </div>
            </div>
        </Dialog>
    );
}
