import {
    Alert,
    AppIcon,
    Button,
    CardIcon,
    CheckIcon,
    Chip,
    ConfirmationDialog,
    currentPeriod,
    EarningsIcon,
    ExternalLinkIcon,
    GitHubIcon,
    GlobeIcon,
    IconButton,
    InlineLink,
    KeyIcon,
    LockIcon,
    PencilIcon,
    Surface,
    XIcon,
} from "@pollinations/ui";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import {
    type AppCategory,
    type AppPlatform,
    CATEGORY_LABELS,
    PLATFORM_LABELS,
} from "../../../../shared/app-catalog.ts";
import type { AppUpdate, ListedApp } from "../backend-types.ts";
import { resourceActionError } from "../lib/resource-action-error.ts";
import { CommunityDetailRow } from "./community-endpoints/community-endpoint-card.tsx";
import {
    type DashboardApp,
    EditAppDialog,
    type NewAppKey,
} from "./edit-app-dialog.tsx";
import { APP_KEY_DELETE_WARNING } from "./keys/key-delete-confirmation.tsx";
import { isAppKey, readRedirectUris } from "./keys/key-type.ts";
import type { ApiKey, ApiKeyUpdateParams } from "./keys/types.ts";
import { CardLoading, LoadError } from "./layout/dashboard-loading.tsx";
import { formatUsd } from "./pollen/format-usd.ts";
import { ResourceCardHeader } from "./resource-card-header.tsx";

/** The public catalog every listing here appears in. */
const APP_CATALOG_URL = "https://pollinations.ai/apps";

/** The submission form every listed app started as (issue template). */
const SUBMIT_APP_URL =
    "https://github.com/pollinations/pollinations/issues/new?template=app-submission.yml";

function formatDate(value: string | null): string | null {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString("en-US", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
    });
}

/**
 * An App Key joins the app whose address its redirect URL covers; a key that
 * covers none is a private app of its own.
 * ponytail: matched by address on every load; store the key on the app when a
 * key must stay with an app whose address or redirect URLs change.
 */
function appsWithKeys(listings: ListedApp[], keys: ApiKey[]): DashboardApp[] {
    const free = keys.filter(isAppKey);
    const apps = listings.map((listing) => {
        const base = listing.webUrl.replace(/\/+$/, "");
        const index = base
            ? free.findIndex((key) =>
                  readRedirectUris(key.metadata).some(
                      (uri) =>
                          uri === base ||
                          ["/", "?", "#"].some((end) =>
                              uri.startsWith(base + end),
                          ),
                  ),
              )
            : -1;
        return {
            listing,
            appKey: index < 0 ? null : free.splice(index, 1)[0],
        };
    });
    return [...apps, ...free.map((appKey) => ({ listing: null, appKey }))];
}

const appId = ({ listing, appKey }: DashboardApp) =>
    listing?.id ?? appKey?.id ?? "";

/** A link as the card shows it: no scheme, no trailing slash. */
const shortUrl = (url: string) =>
    url.replace(/^https?:\/\//, "").replace(/\/+$/, "");

/**
 * One app: the name and what kind of app it is across the top, then what it
 * looks like (description, screenshot) beside how it is set up (the model
 * card's rows) from a 44rem list, stacked below that. The list needs
 * `@container`.
 */
function AppCard({
    app: { listing, appKey },
    earned,
    onEdit,
    onDelete,
}: {
    app: DashboardApp;
    /** Earned through this app's key in the last 7 days. */
    earned: number;
    onEdit: () => void;
    onDelete: () => void;
}) {
    const name = listing?.name ?? appKey?.name ?? "";
    const listed = listing?.listed ?? false;
    const key = appKey?.metadata?.plaintextKey as string | undefined;
    const approved = formatDate(listing?.approvedDate ?? null);
    const iconClass = "h-3.5 w-3.5";
    const kinds = [
        listing?.category &&
            (CATEGORY_LABELS[listing.category as AppCategory] ??
                listing.category),
        ...(listing?.platforms ?? []).map(
            (platform) => PLATFORM_LABELS[platform as AppPlatform] ?? platform,
        ),
    ].filter(Boolean);

    return (
        <Surface className="flex flex-col gap-3 transition-colors hover:bg-surface-opaque/90">
            <ResourceCardHeader
                icon={<AppIcon className="h-4 w-4" aria-hidden="true" />}
                title={name}
                badges={
                    <>
                        <Chip intent={listed ? "news" : "neutral"} size="sm">
                            {listed ? (
                                <GlobeIcon className="h-3 w-3" />
                            ) : (
                                <LockIcon className="h-3 w-3" />
                            )}
                            {listed ? "Public" : "Private"}
                        </Chip>
                        {kinds.map((kind) => (
                            <Chip
                                key={kind}
                                intent="neutral"
                                size="sm"
                                className="text-theme-text-muted!"
                            >
                                {kind}
                            </Chip>
                        ))}
                    </>
                }
                actions={
                    <>
                        <IconButton
                            intent="info"
                            title="Edit app"
                            aria-haspopup="dialog"
                            onClick={onEdit}
                        >
                            <PencilIcon className="h-4 w-4" />
                        </IconButton>
                        <IconButton
                            intent="danger"
                            title="Delete app"
                            aria-haspopup="dialog"
                            onClick={onDelete}
                        >
                            <XIcon className="h-4 w-4" />
                        </IconButton>
                    </>
                }
            />
            <div className="grid gap-4 @min-[44rem]:grid-cols-[18rem_minmax(0,1fr)] @min-[44rem]:gap-6">
                <div className="flex min-w-0 flex-col gap-3">
                    <p className="text-sm text-theme-text-muted">
                        {listing?.description || "No description yet."}
                    </p>
                    {listing?.screenshotUrl && (
                        <img
                            src={listing.screenshotUrl}
                            alt=""
                            loading="lazy"
                            className="aspect-[2/1] w-full max-w-sm rounded-lg object-cover object-top"
                        />
                    )}
                </div>
                {/* Behind a line, as the models catalog sets off its prices. */}
                <div className="grid min-w-0 content-start gap-2 @min-[44rem]:border-l @min-[44rem]:border-divider @min-[44rem]:pl-4">
                    {listing?.webUrl && (
                        <CommunityDetailRow
                            icon={<ExternalLinkIcon className={iconClass} />}
                            label="App URL"
                            value={shortUrl(listing.webUrl)}
                            copyValue={listing.webUrl}
                            copyLabel="Copy app URL"
                        />
                    )}
                    {listing?.repositoryUrl && (
                        <CommunityDetailRow
                            icon={<GitHubIcon className={iconClass} />}
                            label="Repository"
                            // The repository's own name; the button copies the whole link.
                            value={
                                shortUrl(listing.repositoryUrl)
                                    .split("/")
                                    .pop() ?? ""
                            }
                            copyValue={listing.repositoryUrl}
                            copyLabel="Copy repository"
                        />
                    )}
                    {approved && (
                        <CommunityDetailRow
                            icon={<CheckIcon className={iconClass} />}
                            label="Approved"
                            value={approved}
                        />
                    )}
                    {listing && (
                        <div className="my-1 border-t border-divider" />
                    )}
                    <CommunityDetailRow
                        icon={<CardIcon className={iconClass} />}
                        label="Pollinations Pay"
                        value={appKey ? "Active" : "Inactive"}
                    />
                    {appKey && (
                        <CommunityDetailRow
                            icon={<KeyIcon className={iconClass} />}
                            label="App key"
                            value={key ?? `${appKey.start}…`}
                            copyLabel={key && "Copy app key"}
                        />
                    )}
                    {appKey?.metadata?.earningsEnabled === true && (
                        <CommunityDetailRow
                            icon={<EarningsIcon className={iconClass} />}
                            label="Earnings"
                            value={
                                <>
                                    <span className="font-mono whitespace-nowrap text-theme-text-strong">
                                        +{formatUsd(earned)} in 7 days
                                    </span>
                                    <Link
                                        data-size="footer"
                                        data-tone="quiet"
                                        to="/activity"
                                        search={{
                                            granularity: "day",
                                            period: currentPeriod().period,
                                            tab: "earnings",
                                            keys: [appKey.id],
                                        }}
                                        className="polli-link"
                                    >
                                        Activity
                                    </Link>
                                </>
                            }
                        />
                    )}
                </div>
            </div>
        </Surface>
    );
}

/** Opens the app submission form; the Apps tab shows it once you have apps. */
export function SubmitAppButton() {
    return (
        <Button
            intent="commit"
            as="a"
            href={SUBMIT_APP_URL}
            target="_blank"
            rel="noreferrer"
            icon={<GitHubIcon />}
        >
            Submit
        </Button>
    );
}

/** Your apps, listed or private: the My listings card's Apps tab. */
export function MyApps({
    apps: listings,
    apiKeys,
    earnedByKey,
    githubConnected,
    onRetry,
    onUpdateApp,
    onUpdateKey,
    onCreateKey,
    onDeleteKey,
    onDeleteApp,
}: {
    apps: ListedApp[] | null | undefined;
    apiKeys: ApiKey[];
    earnedByKey: ReadonlyMap<string, number>;
    githubConnected: boolean;
    onRetry: () => Promise<void>;
    onUpdateApp: (id: string, changes: AppUpdate) => Promise<void>;
    onUpdateKey: (id: string, updates: ApiKeyUpdateParams) => Promise<void>;
    onCreateKey: (key: NewAppKey) => Promise<void>;
    onDeleteKey: (id: string) => Promise<void>;
    onDeleteApp: (id: string) => Promise<void>;
}) {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    if (listings === undefined) return <CardLoading />;
    if (listings === null) {
        return (
            <LoadError onRetry={onRetry} paths={["/account/apps"]}>
                Couldn’t load your apps. Please try again.
            </LoadError>
        );
    }
    const apps = appsWithKeys(listings, apiKeys);
    const editing = apps.find((app) => appId(app) === editingId);
    const deleting = apps.find((app) => appId(app) === deletingId);

    async function handleDelete() {
        if (!deleting || isDeleting) return;
        setIsDeleting(true);
        setDeleteError(null);
        try {
            if (deleting.listing) await onDeleteApp(deleting.listing.id);
            if (deleting.appKey) await onDeleteKey(deleting.appKey.id);
            setDeletingId(null);
        } catch (error) {
            setDeleteError(resourceActionError("delete", "the app", error));
        } finally {
            setIsDeleting(false);
        }
    }

    return (
        <>
            {apps.length === 0 ? (
                <Surface className="p-6 text-center">
                    <div className="mb-2">
                        <SubmitAppButton />
                    </div>
                    <p className="text-sm text-theme-text-muted">
                        Submit your app for a maintainer to review.
                    </p>
                </Surface>
            ) : (
                <div className="@container flex flex-col gap-3">
                    {apps.map((app) => (
                        <AppCard
                            key={appId(app)}
                            app={app}
                            earned={earnedByKey.get(app.appKey?.id ?? "") ?? 0}
                            onEdit={() => setEditingId(appId(app))}
                            onDelete={() => setDeletingId(appId(app))}
                        />
                    ))}
                </div>
            )}
            <p className="flex items-start gap-1.5 px-1 text-[13px] leading-snug text-theme-text-muted">
                <GitHubIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                    Approved apps join the{" "}
                    <InlineLink href={APP_CATALOG_URL}>app catalog</InlineLink>{" "}
                    and show here for the GitHub account that submitted them.
                    {!githubConnected && (
                        <>
                            {" "}
                            <InlineLink href="/account">
                                Connect GitHub
                            </InlineLink>{" "}
                            to see yours.
                        </>
                    )}
                </span>
            </p>
            <ConfirmationDialog
                open={Boolean(deleting)}
                title="Delete app?"
                description={`${deleting?.listing?.listed ? "The app leaves the app catalog. " : ""}${deleting?.appKey ? APP_KEY_DELETE_WARNING : "Deleting it cannot be undone."}`}
                confirmLabel={isDeleting ? "Deleting…" : "Delete"}
                confirmDisabled={isDeleting}
                cancelDisabled={isDeleting}
                onConfirm={handleDelete}
                onCancel={() => {
                    setDeletingId(null);
                    setDeleteError(null);
                }}
            >
                {deleteError && <Alert intent="danger">{deleteError}</Alert>}
            </ConfirmationDialog>
            {editing && (
                <EditAppDialog
                    key={appId(editing)}
                    app={editing}
                    onUpdateApp={onUpdateApp}
                    onUpdateKey={onUpdateKey}
                    onCreateKey={onCreateKey}
                    onDeleteKey={onDeleteKey}
                    onClose={() => setEditingId(null)}
                />
            )}
        </>
    );
}
