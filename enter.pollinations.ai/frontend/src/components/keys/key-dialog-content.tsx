import {
    AppIcon,
    Button,
    CheckIcon,
    ClipboardIcon,
    CopyButton,
    CopyField,
    DialogBody,
    DialogHeader,
    FieldStack,
    InfoTip,
    InlineLink,
    KeyChip,
    KeyIcon,
    XIcon,
} from "@pollinations/ui";
import {
    AuthAccessItem,
    AuthInfoCard,
    AuthModalFootnote,
    ErrorBanner,
} from "@pollinations/ui/auth";
import type { FormEventHandler, ReactNode } from "react";
import { genDocsUrl } from "../../config.ts";
import { KeyNameField } from "./key-name-field.tsx";
import {
    KeyPermissionsInputs,
    type useKeyPermissions,
} from "./key-permissions.tsx";
import { PublishableKeySettings } from "./publishable-key-settings.tsx";

type KeyDialogContentProps = {
    header?: ReactNode;
    mode: "create" | "edit";
    app: boolean;
    publishable: boolean;
    name: string;
    onNameChange: (name: string) => void;
    permissions: ReturnType<typeof useKeyPermissions>;
    redirectUris: string[];
    onRedirectUrisChange: (uris: string[]) => void;
    earningsEnabled: boolean;
    onEarningsEnabledChange: (enabled: boolean) => void;
    existingKey?: { prefix: string; value?: string };
    createdKey?: string;
    error: string | null;
    isSubmitting: boolean;
    showFields?: boolean;
    onSubmit: FormEventHandler<HTMLFormElement>;
    onClose: () => void;
    onCopied?: () => void;
    onCopyError?: () => void;
    footnote?: ReactNode;
};

/** The same key editor for Create and Edit; only saved values and actions vary. */
export function KeyDialogContent({
    header,
    mode,
    app,
    publishable,
    name,
    onNameChange,
    permissions,
    redirectUris,
    onRedirectUrisChange,
    earningsEnabled,
    onEarningsEnabledChange,
    existingKey,
    createdKey,
    error,
    isSubmitting,
    showFields = true,
    onSubmit,
    onClose,
    onCopied,
    onCopyError,
    footnote,
}: KeyDialogContentProps) {
    const titles = {
        create: app ? "Create app key" : "Create secret key",
        edit: app
            ? "Edit app key"
            : publishable
              ? "Edit publishable key"
              : "Edit secret key",
    };
    const title =
        createdKey !== undefined
            ? app
                ? "App key created"
                : "Secret key created"
            : titles[mode];
    const description =
        createdKey !== undefined
            ? app
                ? "Use this app key to connect your app to Pollinations."
                : "Copy your secret key now. You won’t be able to see it again."
            : publishable
              ? "Set the name, earnings, and redirect URLs."
              : "Choose what this key can access and how much it can spend.";

    const KeyTypeIcon = app ? AppIcon : KeyIcon;
    const submitAction =
        createdKey !== undefined ? (
            <CopyButton
                value={createdKey}
                variant="button"
                intent="commit"
                copiedTimeoutMs={500}
                tooltip={null}
                onCopied={onCopied}
                onCopyError={onCopyError}
            >
                {(copied) => (
                    <span className="inline-flex items-center gap-2">
                        <span
                            aria-hidden="true"
                            className="flex size-4 shrink-0 [&>svg]:size-full"
                        >
                            {copied ? <CheckIcon /> : <ClipboardIcon />}
                        </span>
                        {copied ? "Copied" : "Copy and close"}
                    </span>
                )}
            </CopyButton>
        ) : (
            <Button
                icon={<KeyTypeIcon />}
                type="submit"
                intent="commit"
                disabled={isSubmitting || (mode === "create" && !name.trim())}
            >
                {isSubmitting
                    ? mode === "create"
                        ? "Creating…"
                        : "Saving…"
                    : mode === "create"
                      ? titles.create
                      : "Save changes"}
            </Button>
        );

    const actions = (
        <>
            <Button
                icon={<XIcon />}
                type="button"
                intent="neutral"
                onClick={onClose}
                disabled={isSubmitting}
            >
                {createdKey !== undefined ? "Close" : "Cancel"}
            </Button>
            {submitAction}
        </>
    );

    return (
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={onSubmit}>
            <DialogBody
                actions={actions}
                footnote={
                    footnote && (
                        <AuthModalFootnote>{footnote}</AuthModalFootnote>
                    )
                }
            >
                {header && <div className="-mx-6 -mt-4">{header}</div>}
                <DialogHeader
                    inBody
                    title={title}
                    description={
                        createdKey !== undefined ? (
                            description
                        ) : (
                            <>
                                {description}{" "}
                                <InlineLink
                                    href={genDocsUrl(
                                        publishable
                                            ? "#tag/connect-user-wallets"
                                            : "#tag/authentication",
                                    )}
                                >
                                    Read the guide
                                </InlineLink>
                            </>
                        )
                    }
                >
                    {existingKey && (
                        <div className="mt-3">
                            <KeyChip
                                prefix={existingKey.prefix}
                                value={existingKey.value}
                                label="Copy app key"
                            />
                        </div>
                    )}
                </DialogHeader>
                {error && <ErrorBanner>{error}</ErrorBanner>}
                {createdKey !== undefined ? (
                    <AuthInfoCard>
                        <FieldStack
                            label={
                                <span className="inline-flex items-center gap-1.5">
                                    <KeyTypeIcon
                                        aria-hidden="true"
                                        className="h-4 w-4"
                                    />
                                    {app ? "App key" : "Secret key"}
                                </span>
                            }
                            helper={
                                !app
                                    ? "Keep this key in your backend. Don’t share it or include it in public code."
                                    : undefined
                            }
                        >
                            <CopyField
                                value={createdKey}
                                label={app ? "Copy app key" : "Copy secret key"}
                            />
                        </FieldStack>
                    </AuthInfoCard>
                ) : showFields ? (
                    <div className="space-y-4">
                        <AuthInfoCard>
                            <ul className="space-y-3 text-sm">
                                <KeyNameField
                                    app={app}
                                    publishable={publishable}
                                    value={name}
                                    onChange={onNameChange}
                                    disabled={isSubmitting}
                                />
                                {publishable && (
                                    <AuthAccessItem
                                        checked={earningsEnabled}
                                        onChange={onEarningsEnabledChange}
                                        disabled={isSubmitting}
                                        ariaLabel="Receive 20% of the Pollen users spend in your app"
                                        info={
                                            <InfoTip
                                                text="When enabled, 20% of the Pollen users spend through your app is credited to your balance. Your own spending does not generate earnings."
                                                label="App earnings information"
                                            />
                                        }
                                    >
                                        Receive 20% of the Pollen users spend in
                                        your app
                                    </AuthAccessItem>
                                )}
                            </ul>
                        </AuthInfoCard>
                        {publishable ? (
                            <PublishableKeySettings
                                redirectUris={redirectUris}
                                onRedirectUrisChange={onRedirectUrisChange}
                                disabled={isSubmitting}
                            />
                        ) : (
                            <KeyPermissionsInputs
                                value={permissions}
                                disabled={isSubmitting}
                            />
                        )}
                    </div>
                ) : null}
            </DialogBody>
        </form>
    );
}
