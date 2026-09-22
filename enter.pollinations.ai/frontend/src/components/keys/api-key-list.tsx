import {
    AppIcon,
    Button,
    Chip,
    GlobeIcon,
    IconButton,
    InlineLink,
    KeyChip,
    KeyIcon,
    PencilIcon,
    PlusIcon,
    Section,
    Surface,
    TerminalIcon,
    TokensIcon,
    Tooltip,
    XIcon,
} from "@pollinations/ui";
import { formatDistanceToNowStrict } from "date-fns";
import type { FC } from "react";
import { useState } from "react";
import { resourceActionError } from "../../lib/resource-action-error.ts";
import { ResourceCardHeader } from "../resource-card-header.tsx";
import { ApiKeyDialog } from "./api-key-dialog.tsx";
import { EditApiKeyDialog } from "./edit-api-key-dialog.tsx";
import { DeleteConfirmation } from "./key-delete-confirmation.tsx";
import { isAppKey, isPublishableKey, readRedirectUris } from "./key-type.ts";
import { LimitsBadge, shortLocale } from "./limits-badge.tsx";
import { ModelsBadge } from "./models-badge.tsx";
import type { ApiKey, ApiKeyManagerProps } from "./types.ts";

const accountPermissionLabels: Record<string, string> = {
    profile: "Profile",
    usage: "Usage",
    keys: "Keys",
};

export const ApiKeyList: FC<ApiKeyManagerProps> = ({
    apiKeys,
    onCreate,
    onUpdate,
    onDelete,
}) => {
    const [keyCreateOpen, setKeyCreateOpen] = useState(false);
    const [appCreateOpen, setAppCreateOpen] = useState(false);
    const [deletingKey, setDeletingKey] = useState<ApiKey | null>(null);
    const [editingKey, setEditingKey] = useState<ApiKey | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    async function handleDelete(): Promise<void> {
        if (!deletingKey || isDeleting) return;
        setIsDeleting(true);
        setDeleteError(null);
        try {
            await onDelete(deletingKey.id);
            setDeletingKey(null);
        } catch (error) {
            setDeleteError(
                resourceActionError(
                    "delete",
                    isAppKey(deletingKey) ? "the app key" : "the secret key",
                    error,
                ),
            );
        } finally {
            setIsDeleting(false);
        }
    }

    const now = Date.now();
    const visibleKeys = apiKeys.filter(
        (k) => !k.expiresAt || new Date(k.expiresAt).getTime() > now,
    );
    const sortedKeys = [...visibleKeys].sort(
        (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    const sortedApiKeys = sortedKeys.filter((apiKey) => !isAppKey(apiKey));
    const sortedAppKeys = sortedKeys.filter(isAppKey);

    function renderKeyCard(apiKey: ApiKey) {
        const isPublishable = isPublishableKey(apiKey);
        const isApp = isAppKey(apiKey);
        const keyLabel = isApp ? "app key" : "secret key";
        const plaintextKey = apiKey.metadata?.plaintextKey as
            | string
            | undefined;
        const redirectUrisMeta = readRedirectUris(apiKey.metadata);
        const primaryRedirectUri = redirectUrisMeta[0] || "";
        const extraRedirectUriCount = Math.max(0, redirectUrisMeta.length - 1);
        const earningsEnabled = apiKey.metadata?.earningsEnabled === true;
        const accountPermissions = apiKey.permissions?.account ?? [];

        return (
            <Surface
                key={apiKey.id}
                className="transition-colors hover:bg-surface-opaque/90"
            >
                <ResourceCardHeader
                    icon={
                        <>
                            {isApp ? (
                                <AppIcon className="h-4 w-4" />
                            ) : isPublishable ? (
                                <GlobeIcon className="h-4 w-4" />
                            ) : (
                                <KeyIcon className="h-4 w-4" />
                            )}
                            <span className="sr-only">
                                {isApp
                                    ? "App key"
                                    : isPublishable
                                      ? "Publishable key"
                                      : "Secret key"}
                            </span>
                        </>
                    }
                    title={apiKey.name}
                    actions={
                        <>
                            <IconButton
                                intent="info"
                                title={`Edit ${keyLabel}`}
                                tooltip={`Edit ${keyLabel}`}
                                tooltipAlign="center"
                                tooltipClampToViewport={false}
                                aria-haspopup="dialog"
                                onClick={() => setEditingKey(apiKey)}
                            >
                                <PencilIcon className="h-4 w-4" />
                            </IconButton>
                            <IconButton
                                intent="danger"
                                title={`Delete ${keyLabel}`}
                                tooltip={`Delete ${keyLabel}`}
                                tooltipAlign="center"
                                tooltipClampToViewport={false}
                                aria-haspopup="dialog"
                                onClick={() => {
                                    setDeleteError(null);
                                    setDeletingKey(apiKey);
                                }}
                            >
                                <XIcon className="h-4 w-4" />
                            </IconButton>
                        </>
                    }
                />
                <div className="mt-1 min-w-0">
                    <KeyChip
                        prefix={apiKey.start ?? ""}
                        value={isPublishable ? plaintextKey : undefined}
                        label="Copy app key"
                    />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                    <span>
                        <span className="text-theme-text-muted">Created: </span>
                        <span className="text-theme-text-muted">
                            {formatDistanceToNowStrict(apiKey.createdAt, {
                                addSuffix: false,
                                locale: shortLocale,
                            })}
                        </span>
                    </span>
                    <span>
                        <span className="text-theme-text-muted">Used: </span>
                        <span className="text-theme-text-muted">
                            {apiKey.lastRequest
                                ? formatDistanceToNowStrict(
                                      new Date(apiKey.lastRequest),
                                      {
                                          addSuffix: false,
                                          locale: shortLocale,
                                      },
                                  )
                                : "never"}
                        </span>
                    </span>
                    {isPublishable && primaryRedirectUri && (
                        <span className="inline-flex min-w-0 items-center gap-1">
                            <span className="text-theme-text-muted">
                                Redirect:{" "}
                            </span>
                            <InlineLink
                                href={primaryRedirectUri}
                                className="inline-flex min-w-0 max-w-[200px] items-center"
                            >
                                <span className="truncate">
                                    {primaryRedirectUri.replace(
                                        /^https?:\/\//,
                                        "",
                                    )}
                                </span>
                            </InlineLink>
                            {extraRedirectUriCount > 0 && (
                                <Tooltip
                                    content={
                                        <span className="block whitespace-pre-line">
                                            Additional redirects
                                            {"\n"}
                                            {redirectUrisMeta
                                                .slice(1)
                                                .map((uri) =>
                                                    uri.replace(
                                                        /^https?:\/\//,
                                                        "",
                                                    ),
                                                )
                                                .join("\n")}
                                        </span>
                                    }
                                    displayContents
                                >
                                    <Chip size="sm">
                                        +{extraRedirectUriCount}
                                    </Chip>
                                </Tooltip>
                            )}
                        </span>
                    )}
                    {isApp && (
                        <Chip
                            intent="neutral"
                            size="sm"
                            className={
                                earningsEnabled
                                    ? "text-intent-success-text"
                                    : "bg-ink-100 text-theme-text-muted"
                            }
                        >
                            Earnings {earningsEnabled ? "on" : "off"}
                        </Chip>
                    )}
                    {!isApp && (
                        <>
                            <LimitsBadge
                                expiresAt={
                                    apiKey.expiresAt
                                        ? new Date(apiKey.expiresAt)
                                        : null
                                }
                                pollenBudget={apiKey.pollenBalance}
                            />
                            <span className="flex items-center gap-1">
                                <span className="text-theme-text-muted">
                                    Models:
                                </span>
                                <ModelsBadge permissions={apiKey.permissions} />
                            </span>
                            {accountPermissions.length > 0 && (
                                <span className="flex items-center gap-1">
                                    <span className="text-theme-text-muted">
                                        Account:
                                    </span>
                                    {accountPermissions.map((permission) => (
                                        <Chip
                                            key={permission}
                                            intent="neutral"
                                            size="sm"
                                        >
                                            {accountPermissionLabels[
                                                permission
                                            ] ?? permission}
                                        </Chip>
                                    ))}
                                </span>
                            )}
                        </>
                    )}
                </div>
            </Surface>
        );
    }

    const keyAction = (
        <Button
            type="button"
            className="dashboard-add-button"
            aria-label="Create secret key"
            title="Create secret key"
            aria-haspopup="dialog"
            onClick={() => setKeyCreateOpen(true)}
        >
            <PlusIcon className="h-4 w-4" />
            <KeyIcon className="h-5 w-5" />
        </Button>
    );
    const appAction = (
        <Button
            type="button"
            className="dashboard-add-button"
            aria-label="Create app key"
            title="Create app key"
            aria-haspopup="dialog"
            onClick={() => setAppCreateOpen(true)}
        >
            <PlusIcon className="h-4 w-4" />
            <AppIcon className="h-5 w-5" />
        </Button>
    );

    return (
        <>
            <div className="flex flex-col gap-6">
                <Section
                    title="Secrets"
                    id="api-keys"
                    action={sortedApiKeys.length > 0 && keyAction}
                >
                    <div className="flex flex-col gap-3">
                        {!sortedApiKeys.length && (
                            <Surface className="p-6 text-center">
                                <div className="mb-2">{keyAction}</div>
                                <p className="text-sm text-theme-text-muted">
                                    Use secret keys for your own private
                                    server-side integrations.
                                </p>
                            </Surface>
                        )}
                        {sortedApiKeys.map(renderKeyCard)}
                    </div>
                    <p className="flex items-start gap-1.5 px-1 text-[13px] leading-snug text-theme-text-muted">
                        <TerminalIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>
                            Your backends, scripts, CLIs, connected apps, and
                            devices use these keys and spend from your
                            Pollinations account. Keep them private.
                        </span>
                    </p>
                </Section>
                <Section
                    title="Apps"
                    id="app-keys"
                    action={sortedAppKeys.length > 0 && appAction}
                >
                    <div className="flex flex-col gap-3">
                        {!sortedAppKeys.length && (
                            <Surface className="p-6 text-center">
                                <div className="mb-2">{appAction}</div>
                                <p className="text-sm text-theme-text-muted">
                                    Use app keys when your users bring their own
                                    Pollinations account.
                                </p>
                            </Surface>
                        )}
                        {sortedAppKeys.map(renderKeyCard)}
                    </div>
                    <div className="space-y-2 px-1 text-[13px] leading-snug text-theme-text-muted">
                        <p className="flex items-start gap-1.5">
                            <GlobeIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>
                                For apps where users sign in with their own
                                Pollinations account and spend their own Pollen.
                                Connect your app with the Pollinations SDK.
                            </span>
                        </p>
                        <p className="flex items-start gap-1.5">
                            <TokensIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>
                                Turn on earnings to receive 20% of the Pollen
                                users spend in your app.
                            </span>
                        </p>
                    </div>
                </Section>
            </div>
            <DeleteConfirmation
                app={deletingKey ? isAppKey(deletingKey) : null}
                error={deleteError}
                pending={isDeleting}
                onConfirm={handleDelete}
                onCancel={() => {
                    if (!isDeleting) {
                        setDeletingKey(null);
                        setDeleteError(null);
                    }
                }}
            />
            {editingKey && (
                <EditApiKeyDialog
                    apiKey={editingKey}
                    onUpdate={onUpdate}
                    onClose={() => setEditingKey(null)}
                />
            )}
            <ApiKeyDialog
                open={keyCreateOpen}
                onOpenChange={setKeyCreateOpen}
                onSubmit={onCreate}
            />
            <ApiKeyDialog
                open={appCreateOpen}
                onOpenChange={setAppCreateOpen}
                onSubmit={onCreate}
                simplified
            />
        </>
    );
};
