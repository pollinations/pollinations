import type { FC } from "react";
import { useEffect, useState } from "react";
import {
    adjectives,
    animals,
    uniqueNamesGenerator,
} from "unique-names-generator";
import { ResourceDialog } from "../layout/resource-dialog.tsx";
import { KeyDialogContent } from "./key-dialog-content.tsx";
import { DEFAULT_KEY_LIMITS } from "./key-limit-input.tsx";
import { useKeyPermissions } from "./key-permissions.tsx";
import type { CreateApiKey, CreateApiKeyResponse } from "./types.ts";

/**
 * Pre-filled callback for app keys so local dev works out of the box. Loopback
 * ports are wildcarded (RFC 8252 §7.3), so only the path needs editing. The
 * dev sees it in the editor and should remove it before production.
 */
const DEFAULT_LOCALHOST_REDIRECT = "http://localhost/callback";

type ApiKeyDialogProps = {
    onSubmit: (state: CreateApiKey) => Promise<CreateApiKeyResponse>;
    onComplete: () => void;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Simplified mode: hides key type selector, permissions, budget, expiry. Shows only app key settings. */
    simplified?: boolean;
};

function generateFunName(): string {
    return uniqueNamesGenerator({
        dictionaries: [adjectives, animals],
        separator: "-",
        length: 2,
        style: "lowerCase",
    });
}

export const ApiKeyDialog: FC<ApiKeyDialogProps> = ({
    onSubmit,
    onComplete,
    open: isOpen,
    onOpenChange: setIsOpen,
    simplified = false,
}) => {
    const [name, setName] = useState(generateFunName());
    const [description, setDescription] = useState(
        `Created on ${new Date().toLocaleDateString("en-US", { day: "2-digit", month: "2-digit", year: "2-digit" })}`,
    );
    const keyType: "secret" | "publishable" = simplified
        ? "publishable"
        : "secret";
    const [redirectUris, setRedirectUris] = useState<string[]>(
        simplified ? [DEFAULT_LOCALHOST_REDIRECT] : [],
    );
    const [earningsEnabled, setEarningsEnabled] = useState(true);
    const keyPermissions = useKeyPermissions(
        simplified
            ? {
                  pollenBudget: 0,
                  expiryDays: null,
                  allowedModels: [],
                  accountPermissions: [],
              }
            : DEFAULT_KEY_LIMITS,
    );
    const {
        setAllowedModels,
        setAccountPermissions,
        setPollenBudget,
        setExpiryDays,
    } = keyPermissions;
    const [createdKey, setCreatedKey] = useState<CreateApiKeyResponse | null>(
        null,
    );
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);
        try {
            const isPublishable = keyType === "publishable";
            const newKey = await onSubmit({
                name,
                description,
                keyType,
                ...keyPermissions.permissions,
                ...(isPublishable &&
                    redirectUris.filter((v) => v.trim()).length > 0 && {
                        redirectUris: redirectUris
                            .map((v) => v.trim())
                            .filter(Boolean),
                    }),
                ...(isPublishable && { earningsEnabled }),
            });
            setCreatedKey(newKey);
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Failed to create key",
            );
        } finally {
            setIsSubmitting(false);
        }
    }

    function closeAfterCopy() {
        setTimeout(() => {
            onComplete();
            setIsOpen(false);
        }, 500);
    }

    useEffect(() => {
        if (!isOpen) {
            if (!simplified) {
                setAllowedModels(null);
                setAccountPermissions([]);
                setPollenBudget(DEFAULT_KEY_LIMITS.pollenBudget);
                setExpiryDays(DEFAULT_KEY_LIMITS.expiryDays);
            }
            return;
        }

        setCreatedKey(null);
        setError(null);
        setName(generateFunName());
        setRedirectUris(simplified ? [DEFAULT_LOCALHOST_REDIRECT] : []);
        setEarningsEnabled(true);
        const dateStr = new Date().toLocaleDateString("en-US", {
            day: "2-digit",
            month: "2-digit",
            year: "2-digit",
        });
        setDescription(simplified ? "" : `Created on ${dateStr}`);
    }, [
        isOpen,
        simplified,
        setAllowedModels,
        setAccountPermissions,
        setPollenBudget,
        setExpiryDays,
    ]);

    return (
        <ResourceDialog open={isOpen} onOpenChange={setIsOpen} size="lg">
            <KeyDialogContent
                mode="create"
                app={simplified}
                publishable={simplified}
                name={name}
                onNameChange={setName}
                permissions={keyPermissions}
                redirectUris={redirectUris}
                onRedirectUrisChange={setRedirectUris}
                earningsEnabled={earningsEnabled}
                onEarningsEnabledChange={setEarningsEnabled}
                createdKey={createdKey?.key}
                error={error}
                isSubmitting={isSubmitting}
                showFields={isOpen}
                onSubmit={handleSubmit}
                onClose={() => {
                    if (createdKey) onComplete();
                    setIsOpen(false);
                }}
                onCopied={closeAfterCopy}
                onCopyError={() =>
                    setError(
                        "Couldn’t copy the key. Select it and copy it manually before closing.",
                    )
                }
            />
        </ResourceDialog>
    );
};
