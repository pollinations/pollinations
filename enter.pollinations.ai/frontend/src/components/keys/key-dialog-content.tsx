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
    InlineLink,
    KeyChip,
    KeyIcon,
    XIcon,
} from "@pollinations/ui";
import {
    AuthInfoCard,
    AuthModalFootnote,
    ErrorBanner,
} from "@pollinations/ui/auth";
import type { FormEventHandler, ReactNode } from "react";
import { useState } from "react";
import { genDocsUrl } from "../../config.ts";
import { AppEarningsRow } from "./app-earnings-row.tsx";
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
    accessContext?: "app" | "device";
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
    footnote?: ReactNode;
};

type CreatedKeyContentProps = {
    title: string;
    description: string;
    value: string;
    app?: boolean;
    onClose: () => void;
};

/** Shows a new key once, with Copy and close. Used after create and rotate. */
export function CreatedKeyContent({
    title,
    description,
    value,
    app = false,
    onClose,
}: CreatedKeyContentProps) {
    const [copyFailed, setCopyFailed] = useState(false);
    const KeyTypeIcon = app ? AppIcon : KeyIcon;
    const actions = (
        <>
            <Button
                icon={<XIcon />}
                type="button"
                intent="neutral"
                onClick={onClose}
            >
                Close
            </Button>
            <CopyButton
                value={value}
                variant="button"
                copiedTimeoutMs={500}
                tooltip={null}
                onCopied={() => setTimeout(onClose, 500)}
                onCopyError={() => setCopyFailed(true)}
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
        </>
    );

    return (
        <DialogBody actions={actions}>
            <DialogHeader inBody title={title} description={description} />
            {copyFailed && (
                <ErrorBanner>
                    Couldn’t copy the key. Select it and copy it manually before
                    closing.
                </ErrorBanner>
            )}
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
                        value={value}
                        label={app ? "Copy app key" : "Copy secret key"}
                    />
                </FieldStack>
            </AuthInfoCard>
        </DialogBody>
    );
}

/** The same key editor for Create and Edit; only saved values and actions vary. */
export function KeyDialogContent({
    header,
    mode,
    app,
    accessContext,
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
    footnote,
}: KeyDialogContentProps) {
    if (createdKey !== undefined) {
        return (
            <CreatedKeyContent
                app={app}
                title={app ? "App key created" : "Secret key created"}
                description={
                    app
                        ? "Add this app key to your app. You can copy it again from the Apps section at any time."
                        : "Copy your secret key now. You won’t be able to see it again."
                }
                value={createdKey}
                onClose={onClose}
            />
        );
    }

    const titles = {
        create: app ? "Create app key" : "Create secret key",
        edit: accessContext
            ? `Edit ${accessContext} access`
            : app
              ? "Edit app key"
              : publishable
                ? "Edit publishable key"
                : "Edit secret key",
    };
    const description = publishable
        ? "Set the name, earnings and redirect URLs."
        : accessContext
          ? `Choose what this ${accessContext} can access and how much it can spend.`
          : "Choose what this key can access and how much it can spend.";

    const KeyTypeIcon = app ? AppIcon : KeyIcon;
    const nameField = (
        <KeyNameField
            app={app}
            accessContext={accessContext}
            publishable={publishable}
            value={name}
            onChange={onNameChange}
            disabled={isSubmitting}
        />
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
                Cancel
            </Button>
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
                {header && (
                    <div className="-mx-(--polli-dialog-gutter) -mt-4">
                        {header}
                    </div>
                )}
                <DialogHeader
                    inBody
                    title={titles[mode]}
                    description={
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
                    }
                >
                    {existingKey && (
                        <div className="mt-3">
                            <KeyChip
                                prefix={existingKey.prefix}
                                value={existingKey.value}
                                label={
                                    app
                                        ? "Copy app key"
                                        : "Copy publishable key"
                                }
                            />
                        </div>
                    )}
                </DialogHeader>
                {error && <ErrorBanner>{error}</ErrorBanner>}
                {showFields ? (
                    <div className="space-y-3">
                        {publishable && (
                            <AuthInfoCard title="Settings">
                                <ul className="grid gap-2 text-sm">
                                    {nameField}
                                    <AppEarningsRow
                                        checked={earningsEnabled}
                                        onChange={onEarningsEnabledChange}
                                        disabled={isSubmitting}
                                    />
                                </ul>
                            </AuthInfoCard>
                        )}
                        {publishable ? (
                            <PublishableKeySettings
                                redirectUris={redirectUris}
                                onRedirectUrisChange={onRedirectUrisChange}
                                disabled={isSubmitting}
                            />
                        ) : (
                            <KeyPermissionsInputs
                                nameField={nameField}
                                value={permissions}
                                accessContext={accessContext}
                                disabled={isSubmitting}
                            />
                        )}
                    </div>
                ) : null}
            </DialogBody>
        </form>
    );
}
