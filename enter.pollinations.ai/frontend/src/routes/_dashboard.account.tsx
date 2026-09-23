import {
    Alert,
    Button,
    ConfirmationDialog,
    CopyButton,
    DiscordIcon,
    Field,
    FieldStack,
    GitHubIcon,
    Heading,
    InlineLink,
    Input,
    Section,
    SignOutIcon,
    Text,
    TrashIcon,
} from "@pollinations/ui";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { authClient } from "../auth.ts";
import { ConnectedApps } from "../components/account/connected-apps.tsx";
import { Route as DashboardRoute } from "./_dashboard.tsx";

const DELETE_CONFIRMATION = "DELETE";

type DiscordConnection = {
    id: string;
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
};

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
    const { user, githubUsername, discordAvailable } =
        DashboardRoute.useLoaderData();
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [discordConnection, setDiscordConnection] = useState<
        DiscordConnection | null | undefined
    >();
    const [connectionPending, setConnectionPending] = useState(false);
    const [connectionError, setConnectionError] = useState<string | null>(null);
    const [isSigningOut, setIsSigningOut] = useState(false);
    const [signOutError, setSignOutError] = useState<string | null>(null);

    useEffect(() => {
        if (!discordAvailable) return;
        void (async () => {
            try {
                const { data, error } = await authClient.listAccounts();
                if (error) throw error;

                const account = data?.find(
                    (account) => account.providerId === "discord",
                );
                if (!account) {
                    setDiscordConnection(null);
                    return;
                }

                const infoResponse = await authClient
                    .accountInfo({
                        query: { accountId: account.accountId },
                    })
                    .catch(() => null);
                const info = infoResponse?.data;
                const profile = info?.data as
                    | { username?: unknown }
                    | undefined;
                setDiscordConnection({
                    id: account.accountId,
                    username:
                        typeof profile?.username === "string"
                            ? profile.username
                            : null,
                    displayName: info?.user.name || null,
                    avatarUrl: info?.user.image || null,
                });
            } catch {
                setConnectionError("Could not load connected accounts.");
                setDiscordConnection(null);
            }
        })();
    }, [discordAvailable]);

    if (!user) return null;

    const displayName =
        user.name?.trim() || githubUsername || "Pollinations user";
    const checkingDiscord = discordAvailable && discordConnection === undefined;

    async function handleSignOut(): Promise<void> {
        if (isSigningOut) return;
        setIsSigningOut(true);
        setSignOutError(null);
        try {
            const { error } = await authClient.signOut();
            if (error) throw error;
            window.location.href = "/news";
        } catch (error) {
            console.error("Sign out failed:", error);
            setSignOutError("Couldn’t sign out. Please try again.");
            setIsSigningOut(false);
        }
    }

    async function handleDiscordConnection(): Promise<void> {
        setConnectionPending(true);
        setConnectionError(null);

        try {
            if (discordConnection) {
                const { error } = await authClient.unlinkAccount({
                    providerId: "discord",
                });
                if (error) {
                    setConnectionError("Could not disconnect Discord.");
                } else {
                    setDiscordConnection(null);
                }
                return;
            }

            const { error } = await authClient.linkSocial({
                provider: "discord",
                callbackURL: "/account",
            });
            if (error) setConnectionError("Could not connect Discord.");
        } catch {
            setConnectionError(
                discordConnection
                    ? "Could not disconnect Discord."
                    : "Could not connect Discord.",
            );
        } finally {
            setConnectionPending(false);
        }
    }

    return (
        <div className="flex flex-col gap-6">
            <Section title="Profile">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-4">
                        {user.image ? (
                            <img
                                src={user.image}
                                alt={`${displayName} avatar`}
                                className="h-16 w-16 shrink-0 rounded-full"
                            />
                        ) : (
                            <div
                                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-theme-bg-subtle text-theme-text-muted"
                                aria-hidden="true"
                            >
                                <GitHubIcon className="h-7 w-7" />
                            </div>
                        )}
                        <div className="min-w-0">
                            <Heading as="h3" size="subsection">
                                {displayName}
                            </Heading>
                            <Text size="sm" tone="muted" className="truncate">
                                {user.email}
                            </Text>
                            <CopyButton
                                value={user.id}
                                tooltip={null}
                                aria-label="Copy Pollinations ID"
                                className="mt-1 flex max-w-full items-center gap-2 text-left font-mono text-xs text-theme-text-muted transition-colors hover:text-theme-text-strong"
                            >
                                {(copied) => (
                                    <>
                                        <span className="truncate">
                                            {user.id}
                                        </span>
                                        <span className="shrink-0 font-sans font-medium">
                                            {copied ? "Copied" : "Copy"}
                                        </span>
                                    </>
                                )}
                            </CopyButton>
                        </div>
                    </div>
                    <Button
                        type="button"
                        intent="commit"
                        icon={<SignOutIcon />}
                        disabled={isSigningOut}
                        className="shrink-0 self-start sm:self-center"
                        onClick={() => void handleSignOut()}
                    >
                        {isSigningOut ? "Signing out…" : "Sign out"}
                    </Button>
                </div>
            </Section>

            {signOutError && <Alert intent="danger">{signOutError}</Alert>}

            <Section title="Community">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                        {discordConnection?.avatarUrl ? (
                            <img
                                src={discordConnection.avatarUrl}
                                alt="Discord avatar"
                                className="h-10 w-10 shrink-0 rounded-full"
                            />
                        ) : (
                            <DiscordIcon className="h-6 w-6 shrink-0" />
                        )}
                        <div>
                            <Text tone="strong" weight="semibold">
                                Discord
                            </Text>
                            <Text size="sm" tone="muted">
                                {!discordAvailable
                                    ? "Discord linking isn't available in this environment."
                                    : discordConnection
                                      ? [
                                            discordConnection.displayName,
                                            discordConnection.username &&
                                                `@${discordConnection.username}`,
                                        ]
                                            .filter(Boolean)
                                            .join(" · ")
                                      : checkingDiscord
                                        ? "Checking connection..."
                                        : "Connect your Discord identity for community features."}
                            </Text>
                            {discordConnection && (
                                <Text size="sm" tone="muted">
                                    Discord ID: {discordConnection.id}
                                </Text>
                            )}
                        </div>
                    </div>
                    <Button
                        type="button"
                        intent={discordConnection ? "danger" : "commit"}
                        className="shrink-0 self-start sm:self-center"
                        disabled={
                            !discordAvailable ||
                            checkingDiscord ||
                            connectionPending
                        }
                        onClick={() => void handleDiscordConnection()}
                    >
                        {connectionPending
                            ? "Working..."
                            : discordConnection
                              ? "Disconnect Discord"
                              : checkingDiscord
                                ? "Checking..."
                                : "Connect Discord"}
                    </Button>
                </div>
                {connectionError && (
                    <Text size="sm" tone="muted">
                        {connectionError}
                    </Text>
                )}
            </Section>

            <div id="connectors" className="scroll-mt-6">
                <ConnectedApps />
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-sm text-theme-text-muted">
                <span className="font-medium">Need help?</span>
                <InlineLink
                    href="https://discord.com/channels/885844321461485618/889573359111774329"
                    tone="quiet"
                    size="footer"
                    className="inline-flex items-center gap-2"
                >
                    <DiscordIcon className="h-4 w-4" aria-hidden="true" />
                    Get help
                </InlineLink>
                <InlineLink
                    href="https://github.com/pollinations/pollinations/issues"
                    tone="quiet"
                    size="footer"
                    className="inline-flex items-center gap-2"
                >
                    <GitHubIcon className="h-4 w-4" aria-hidden="true" />
                    Report a bug
                </InlineLink>
            </div>

            <Section title="Delete account">
                <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                    <Text size="sm" tone="muted">
                        Permanently delete your account, profile, keys, agents
                        and models. All remaining Pollen will be lost. This
                        cannot be undone, and deleted data cannot be recovered.
                    </Text>
                    <Button
                        type="button"
                        intent="danger"
                        icon={<TrashIcon />}
                        className="shrink-0"
                        onClick={() => setDeleteDialogOpen(true)}
                    >
                        Delete account
                    </Button>
                </div>
            </Section>

            <footer className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-[13px] text-theme-text-muted">
                <span>© 2026 Myceli.AI OÜ</span>
                <InlineLink
                    href="https://pollinations.ai/terms"
                    tone="quiet"
                    size="footer"
                >
                    Terms of Service
                </InlineLink>
                <InlineLink
                    href="https://pollinations.ai/privacy"
                    tone="quiet"
                    size="footer"
                >
                    Privacy Policy
                </InlineLink>
                <InlineLink
                    href="https://pollinations.ai/refunds"
                    tone="quiet"
                    size="footer"
                >
                    Refund Policy
                </InlineLink>
            </footer>

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

        try {
            const result = await authClient.deleteUser();
            if (result.error) {
                setError(result.error.message || "Account deletion failed.");
                return;
            }
            window.location.assign("/news");
        } catch {
            setError("Account deletion failed. Please try again.");
        } finally {
            setIsDeleting(false);
        }
    }

    return (
        <ConfirmationDialog
            open={open}
            onCancel={() => handleOpenChange(false)}
            onConfirm={() => void handleDelete()}
            title="Delete Pollinations account?"
            confirmLabel={isDeleting ? "Deleting…" : "Delete account"}
            confirmDisabled={confirmation !== DELETE_CONFIRMATION || isDeleting}
            cancelDisabled={isDeleting}
        >
            <Alert intent="danger" title="This cannot be undone">
                <div className="flex flex-col gap-3">
                    <p>Deleting your Pollinations account removes:</p>
                    <ul className="list-disc space-y-1 pl-5">
                        <li>
                            Profile, sessions, GitHub connection, and API keys
                        </li>
                        <li>
                            Pollen balances, access to reward history, agents,
                            and community models
                        </li>
                        <li>Published media listings and tags</li>
                    </ul>
                    <p>
                        We retain only your immutable GitHub user ID with
                        records of rewards already issued to prevent duplicate
                        quest payouts.
                    </p>
                    <p>
                        Cached copies of uploaded and generated media may remain
                        temporarily until their retention period ends. Required
                        billing and usage records may also be retained.
                    </p>
                </div>
            </Alert>

            <FieldStack
                label={
                    <>
                        Type{" "}
                        <span className="font-mono font-semibold text-intent-danger-text">
                            {DELETE_CONFIRMATION}
                        </span>{" "}
                        to confirm
                    </>
                }
                error={error}
            >
                <Field.Input asChild>
                    <Input
                        value={confirmation}
                        onChange={(event) =>
                            setConfirmation(event.currentTarget.value)
                        }
                        autoComplete="off"
                        spellCheck={false}
                        disabled={isDeleting}
                    />
                </Field.Input>
            </FieldStack>
        </ConfirmationDialog>
    );
}
