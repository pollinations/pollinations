import {
    Alert,
    AppIcon,
    Button,
    ButtonGroup,
    CheckIcon,
    ChevronIcon,
    CopyField,
    DialogBody,
    DialogHeader,
    Dropdown,
    DropdownItem,
    GitHubIcon,
    InfoTip,
    Input,
    KeyChip,
    PencilIcon,
    TabButton,
    Textarea,
    XIcon,
} from "@pollinations/ui";
import { AuthAccessItem, AuthInfoCard } from "@pollinations/ui/auth";
import { useState } from "react";
import {
    type AppCategory,
    type AppPlatform,
    CATEGORY_LABELS,
    PLATFORM_LABELS,
} from "../../../../shared/app-catalog.ts";
import type { AppUpdate, ListedApp } from "../backend-types.ts";
import { resourceActionError } from "../lib/resource-action-error.ts";
import { ModelFormRow } from "./community-endpoints/model-form-row.tsx";
import { AppEarningsRow } from "./keys/app-earnings-row.tsx";
import { APP_KEY_DELETE_WARNING } from "./keys/key-delete-confirmation.tsx";
import {
    initialKeyEditValues,
    keyEditUpdates,
} from "./keys/key-edit-values.ts";
import {
    DEFAULT_LOCALHOST_REDIRECT,
    REDIRECT_URLS_HELP,
    RedirectUrlsEditor,
} from "./keys/publishable-key-settings.tsx";
import type { ApiKey, ApiKeyUpdateParams } from "./keys/types.ts";
import { ResourceDialog } from "./layout/resource-dialog.tsx";

/** An app as the dashboard holds it: its listing fields and its App Key. */
export type DashboardApp = {
    listing: ListedApp | null;
    appKey: ApiKey | null;
};

export type NewAppKey = {
    name: string;
    redirectUris: string[];
    earningsEnabled: boolean;
};

const SUBMIT_APP_URL =
    "https://github.com/pollinations/pollinations/issues/new?template=app-submission.yml";

/** The GitHub form, filled from what the owner already typed here. */
function submitUrl(fields: {
    name: string;
    description: string;
    url: string;
    repositoryUrl: string;
}): string {
    const params = new URLSearchParams({
        "app-name": fields.name,
        "app-description": fields.description,
        "app-url": fields.url,
        "github-repo": fields.repositoryUrl,
    });
    return `${SUBMIT_APP_URL}&${params}`;
}

/** One value from a short list: the model dialog's fallback picker. */
function ChoiceDropdown({
    label,
    value,
    labels,
    disabled,
    onChange,
}: {
    label: string;
    value: string;
    labels: Record<string, string>;
    disabled: boolean;
    onChange: (value: string) => void;
}) {
    return (
        <Dropdown
            portalled={false}
            align="start"
            className="w-[var(--reference-width)] min-w-0 p-1"
            trigger={(open) => (
                <Button
                    type="button"
                    aria-label={`${label}: ${labels[value] ?? "none"}`}
                    disabled={disabled}
                    className="w-full min-w-0 self-stretch justify-between gap-2"
                >
                    <span className="min-w-0 truncate">
                        {labels[value] ?? "Choose"}
                    </span>
                    <ChevronIcon expanded={open} className="h-4 w-4 shrink-0" />
                </Button>
            )}
        >
            {(close) =>
                Object.entries(labels).map(([option, text]) => (
                    <DropdownItem
                        key={option}
                        className={
                            option === value
                                ? "bg-theme-bg-active text-theme-text-strong"
                                : undefined
                        }
                        onClick={() => {
                            onChange(option);
                            close();
                        }}
                    >
                        {text}
                    </DropdownItem>
                ))
            }
        </Dropdown>
    );
}

/**
 * The whole App Key, copied on click. An App Key is public, so it shows in
 * full; a key stored without its value shows its prefix only.
 */
function AppKeyField({ appKey }: { appKey: ApiKey }) {
    const value = appKey.metadata?.plaintextKey as string | undefined;
    return value ? (
        <CopyField value={value} label="Copy app key" />
    ) : (
        <KeyChip prefix={appKey.start ?? ""} />
    );
}

export function EditAppDialog({
    app,
    onUpdateApp,
    onUpdateKey,
    onCreateKey,
    onDeleteKey,
    onClose,
}: {
    app: DashboardApp;
    onUpdateApp: (id: string, changes: AppUpdate) => Promise<void>;
    onUpdateKey: (id: string, updates: ApiKeyUpdateParams) => Promise<void>;
    onCreateKey: (key: NewAppKey) => Promise<void>;
    onDeleteKey: (id: string) => Promise<void>;
    onClose: () => void;
}) {
    const { listing, appKey } = app;
    const [initialKey] = useState(() =>
        appKey ? initialKeyEditValues(appKey) : null,
    );
    const [name, setName] = useState(listing?.name ?? appKey?.name ?? "");
    const [description, setDescription] = useState(listing?.description ?? "");
    const [url, setUrl] = useState(listing?.webUrl ?? "");
    const [repositoryUrl, setRepositoryUrl] = useState(
        listing?.repositoryUrl ?? "",
    );
    const [category, setCategory] = useState(listing?.category ?? "");
    const [platform, setPlatform] = useState(listing?.platforms[0] ?? "");
    const [redirectUris, setRedirectUris] = useState(
        initialKey?.redirectUris ?? [],
    );
    const [earningsEnabled, setEarningsEnabled] = useState(
        initialKey?.earningsEnabled ?? false,
    );
    // Ticked, the whole section shows; Save makes or deletes the key.
    const [payOn, setPayOn] = useState(Boolean(appKey));
    const [listed, setListed] = useState(listing?.listed ?? false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function run(label: string, action: () => Promise<void>) {
        setIsSubmitting(true);
        setError(null);
        try {
            await action();
        } catch (error) {
            setError(resourceActionError("save", label, error));
        } finally {
            setIsSubmitting(false);
        }
    }

    function switchPay(on: boolean) {
        setPayOn(on);
        // A new key starts like one made on the Keys page.
        if (on && !appKey) {
            setRedirectUris([url.trim() || DEFAULT_LOCALHOST_REDIRECT]);
            setEarningsEnabled(true);
        }
    }

    const save = () =>
        run("the app", async () => {
            if (listing) {
                const edited: AppUpdate = {
                    name: name.trim(),
                    description: description.trim(),
                    url: url.trim() || null,
                    repositoryUrl: repositoryUrl.trim() || null,
                    category: category as AppCategory,
                    platform: platform as AppPlatform,
                    listed,
                };
                const saved: AppUpdate = {
                    name: listing.name,
                    description: listing.description,
                    url: listing.webUrl || null,
                    repositoryUrl: listing.repositoryUrl,
                    category: listing.category as AppCategory,
                    platform: listing.platforms[0] as AppPlatform,
                    listed: listing.listed,
                };
                const changes = Object.fromEntries(
                    Object.entries(edited).filter(
                        ([field, value]) =>
                            value !== saved[field as keyof AppUpdate],
                    ),
                );
                if (Object.keys(changes).length > 0) {
                    await onUpdateApp(listing.id, changes);
                }
            }
            const uris = redirectUris.map((uri) => uri.trim()).filter(Boolean);
            if (appKey && !payOn) {
                await onDeleteKey(appKey.id);
            } else if (appKey && initialKey) {
                // The app has one name: its key carries it to the consent screen.
                const updates = keyEditUpdates(initialKey, {
                    name,
                    redirectUris: uris,
                    earningsEnabled,
                });
                if (Object.keys(updates).length > 0) {
                    await onUpdateKey(appKey.id, updates);
                }
            } else if (payOn) {
                await onCreateKey({
                    name: name.trim(),
                    redirectUris: uris,
                    earningsEnabled,
                });
            }
            onClose();
        });

    const approved = Boolean(listing?.approvedDate);
    return (
        <ResourceDialog
            open
            onOpenChange={(open) => !open && onClose()}
            size="lg"
        >
            <form
                className="flex min-h-0 flex-1 flex-col"
                onSubmit={(event) => {
                    event.preventDefault();
                    void save();
                }}
            >
                <DialogBody
                    actions={
                        <>
                            <Button
                                icon={<XIcon />}
                                type="button"
                                intent="neutral"
                                onClick={onClose}
                                disabled={isSubmitting}
                            >
                                Cancel
                            </Button>
                            <Button
                                icon={<PencilIcon />}
                                type="submit"
                                intent="commit"
                                disabled={isSubmitting || !name.trim()}
                            >
                                {isSubmitting ? "Saving…" : "Save"}
                            </Button>
                        </>
                    }
                >
                    <DialogHeader inBody title="Edit app" />
                    {error && <Alert intent="danger">{error}</Alert>}
                    <div className="space-y-3">
                        <AuthInfoCard>
                            <div className="space-y-3">
                                <ModelFormRow
                                    label="Name"
                                    help="Shown to users when they connect to your app."
                                >
                                    <Input
                                        value={name}
                                        placeholder="App name"
                                        maxLength={80}
                                        required
                                        disabled={isSubmitting}
                                        className="w-full min-w-0"
                                        onChange={(event) =>
                                            setName(event.target.value)
                                        }
                                    />
                                </ModelFormRow>
                                {listing && (
                                    <>
                                        <ModelFormRow
                                            label="Description"
                                            help="One or two sentences on what the app does and how it uses Pollinations, 200 characters max. It appears on your app’s card."
                                            top
                                        >
                                            <Textarea
                                                value={description}
                                                placeholder="Creates collaborative images using the Pollinations image API."
                                                maxLength={200}
                                                disabled={isSubmitting}
                                                className="w-full min-w-0"
                                                onChange={(event) =>
                                                    setDescription(
                                                        event.target.value,
                                                    )
                                                }
                                            />
                                        </ModelFormRow>
                                        <ModelFormRow
                                            label="App URL"
                                            help="Public URL where people can try the app. Leave empty when the repository is the app, such as a plugin or library."
                                            optional
                                        >
                                            <Input
                                                type="url"
                                                value={url}
                                                placeholder="https://example.com"
                                                disabled={isSubmitting}
                                                className="w-full min-w-0"
                                                onChange={(event) =>
                                                    setUrl(event.target.value)
                                                }
                                            />
                                        </ModelFormRow>
                                        <ModelFormRow
                                            label="Repository"
                                            help="Public source repository. Required when there is no App URL."
                                            optional
                                        >
                                            <Input
                                                type="url"
                                                value={repositoryUrl}
                                                placeholder="https://github.com/username/repository"
                                                disabled={isSubmitting}
                                                className="w-full min-w-0"
                                                onChange={(event) =>
                                                    setRepositoryUrl(
                                                        event.target.value,
                                                    )
                                                }
                                            />
                                        </ModelFormRow>
                                        <ModelFormRow label="Category">
                                            <ChoiceDropdown
                                                label="Category"
                                                value={category}
                                                labels={CATEGORY_LABELS}
                                                disabled={isSubmitting}
                                                onChange={setCategory}
                                            />
                                        </ModelFormRow>
                                        <ModelFormRow
                                            label="Platform"
                                            help="Where people use the app. Windows and macOS apps, and plugins for desktop software such as Krita or Obsidian, are desktop."
                                        >
                                            <ChoiceDropdown
                                                label="Platform"
                                                value={platform}
                                                labels={PLATFORM_LABELS}
                                                disabled={isSubmitting}
                                                onChange={setPlatform}
                                            />
                                        </ModelFormRow>
                                    </>
                                )}
                            </div>
                        </AuthInfoCard>

                        <AuthInfoCard>
                            <ul className="grid gap-2 text-sm">
                                <AuthAccessItem
                                    checked={payOn}
                                    onChange={switchPay}
                                    disabled={isSubmitting}
                                    info={
                                        <InfoTip
                                            text="Users sign in to your app and pay with their own pollen. Your app gets an app key when you save."
                                            label="Pollinations Pay information"
                                        />
                                    }
                                >
                                    <span className="inline">
                                        <AppIcon className="mr-1.5 inline-block h-3.5 w-3.5 align-text-bottom text-intent-info-text" />
                                        Add Pollinations Pay to your app
                                    </span>
                                </AuthAccessItem>
                                {payOn && (
                                    <AppEarningsRow
                                        checked={earningsEnabled}
                                        onChange={setEarningsEnabled}
                                        disabled={isSubmitting}
                                    />
                                )}
                            </ul>
                            {appKey && !payOn && (
                                <Alert intent="danger">
                                    Saving deletes this app key.{" "}
                                    {APP_KEY_DELETE_WARNING}
                                </Alert>
                            )}
                            {payOn && appKey && (
                                <ModelFormRow label="App key">
                                    <AppKeyField appKey={appKey} />
                                </ModelFormRow>
                            )}
                            {payOn && (
                                <ModelFormRow
                                    label="Redirect URLs"
                                    help={REDIRECT_URLS_HELP}
                                    top
                                >
                                    <RedirectUrlsEditor
                                        redirectUris={redirectUris}
                                        onRedirectUrisChange={setRedirectUris}
                                        disabled={isSubmitting}
                                    />
                                </ModelFormRow>
                            )}
                        </AuthInfoCard>

                        <AuthInfoCard>
                            <ModelFormRow
                                label="Visibility"
                                help={
                                    approved
                                        ? "Public lists your app in the app catalog. Private hides it; you can make it public again with no new review."
                                        : "Only you see a private app. A maintainer reviews a submission on GitHub before it is listed in the app catalog."
                                }
                                action={
                                    !approved && (
                                        <Button
                                            as="a"
                                            href={submitUrl({
                                                name,
                                                description,
                                                url,
                                                repositoryUrl,
                                            })}
                                            target="_blank"
                                            rel="noreferrer"
                                            size="sm"
                                            icon={<GitHubIcon />}
                                        >
                                            Submit to catalog
                                        </Button>
                                    )
                                }
                            >
                                <ButtonGroup aria-label="App visibility">
                                    <TabButton
                                        active={!listed}
                                        disabled={isSubmitting}
                                        onClick={() => setListed(false)}
                                        size="sm"
                                        className="min-w-24 gap-1.5"
                                    >
                                        {!listed && (
                                            <CheckIcon className="h-3.5 w-3.5" />
                                        )}
                                        Private
                                    </TabButton>
                                    <TabButton
                                        active={listed}
                                        disabled={isSubmitting || !approved}
                                        onClick={() => setListed(true)}
                                        size="sm"
                                        className="min-w-24 gap-1.5"
                                    >
                                        {listed && (
                                            <CheckIcon className="h-3.5 w-3.5" />
                                        )}
                                        Public
                                    </TabButton>
                                </ButtonGroup>
                            </ModelFormRow>
                        </AuthInfoCard>
                    </div>
                </DialogBody>
            </form>
        </ResourceDialog>
    );
}
