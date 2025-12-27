import type { FC } from "react";
import { useState, useEffect, useCallback } from "react";
import { Dialog } from "@ark-ui/react/dialog";
import { Button } from "./button.tsx";
import { ModelPermissions } from "./model-permissions.tsx";
import {
    TurnstileSettings,
    type TurnstileSettingsData,
} from "./turnstile-settings.tsx";

export type ApiKeySettingsValue = {
    allowedModels: string[] | null;
    turnstile: TurnstileSettingsData;
};

type ApiKeySettingsProps = {
    value: ApiKeySettingsValue;
    onChange: (value: ApiKeySettingsValue) => void;
    /** Whether to show turnstile settings (only for publishable keys) */
    showTurnstile?: boolean;
    disabled?: boolean;
};

/**
 * Unified settings panel for API keys.
 * Combines ModelPermissions and TurnstileSettings into one reusable component.
 */
export const ApiKeySettings: FC<ApiKeySettingsProps> = ({
    value,
    onChange,
    showTurnstile = false,
    disabled = false,
}) => {
    return (
        <div className="space-y-3">
            {/* Model Permissions */}
            <ModelPermissions
                value={value.allowedModels}
                onChange={(models) =>
                    onChange({ ...value, allowedModels: models })
                }
                disabled={disabled}
            />

            {/* Turnstile Settings - only for publishable keys */}
            {showTurnstile && (
                <TurnstileSettings
                    value={value.turnstile}
                    onChange={(turnstile) => onChange({ ...value, turnstile })}
                    disabled={disabled}
                />
            )}
        </div>
    );
};

/**
 * Edit dialog for existing API keys.
 * Shows model permissions (read-only) and editable turnstile settings.
 */
export const EditApiKeyDialog: FC<{
    keyId: string;
    keyName: string;
    keyStart: string;
    isPublishable: boolean;
    permissions: { [key: string]: string[] } | null;
    onSave: () => void;
}> = ({ keyId, keyName, keyStart, isPublishable, permissions, onSave }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    // Extract allowed models from permissions object
    const initialModels =
        permissions && "models" in permissions ? permissions.models : null;
    const [settings, setSettings] = useState<ApiKeySettingsValue>({
        allowedModels: initialModels ?? null,
        turnstile: { enabled: false, hostnames: [] },
    });
    const [error, setError] = useState<string | null>(null);

    const fetchTurnstileSettings = useCallback(async () => {
        console.log(
            "[EDIT FETCH] Fetching turnstile for key:",
            keyId,
            "isPublishable:",
            isPublishable,
        );
        if (!isPublishable) {
            setIsLoading(false);
            return;
        }
        try {
            const response = await fetch(`/api/api-keys/${keyId}/turnstile`, {
                credentials: "include",
            });
            console.log("[EDIT FETCH] Response status:", response.status);
            if (response.ok) {
                const data = (await response.json()) as {
                    turnstile: TurnstileSettingsData;
                };
                console.log("[EDIT FETCH] Received turnstile data:", data);
                setSettings((prev) => ({ ...prev, turnstile: data.turnstile }));
            }
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    }, [keyId, isPublishable]);

    // Fetch on mount to show status in button
    useEffect(() => {
        fetchTurnstileSettings();
    }, [fetchTurnstileSettings]);

    useEffect(() => {
        if (isOpen) fetchTurnstileSettings();
    }, [isOpen, fetchTurnstileSettings]);

    const handleSave = async () => {
        setIsSaving(true);
        setError(null);
        try {
            console.log("[EDIT SAVE] Saving settings for key:", keyId);
            // Save model permissions
            const permResponse = await fetch(`/api/api-keys/${keyId}/update`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ allowedModels: settings.allowedModels }),
            });
            console.log(
                "[EDIT SAVE] Permissions response:",
                permResponse.status,
            );
            if (!permResponse.ok) {
                throw new Error("Failed to save model permissions");
            }

            // Save turnstile settings (only for publishable keys)
            if (isPublishable) {
                console.log(
                    "[EDIT SAVE] Saving turnstile settings:",
                    settings.turnstile,
                );
                const turnstileResponse = await fetch(
                    `/api/api-keys/${keyId}/turnstile`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify(settings.turnstile),
                    },
                );
                console.log(
                    "[EDIT SAVE] Turnstile response:",
                    turnstileResponse.status,
                    await turnstileResponse.clone().text(),
                );
                if (!turnstileResponse.ok) {
                    throw new Error("Failed to save turnstile settings");
                }
            }

            onSave();
            setIsOpen(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to save");
            console.error(err);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog.Root open={isOpen} onOpenChange={({ open }) => setIsOpen(open)}>
            <Dialog.Trigger>
                <button
                    type="button"
                    className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
                    title="Settings"
                >
                    ⚙️
                </button>
            </Dialog.Trigger>
            <Dialog.Backdrop className="fixed inset-0 bg-green-950/50 z-[100]" />
            <Dialog.Positioner className="fixed inset-0 flex items-center justify-center p-4 z-[100]">
                <Dialog.Content className="bg-green-100 border-green-950 border-4 rounded-lg shadow-lg max-w-lg w-full p-6 max-h-[85vh] overflow-y-auto">
                    <Dialog.Title className="text-lg font-semibold mb-1">
                        ⚙️ API Key Settings
                    </Dialog.Title>
                    <Dialog.Description className="text-sm text-gray-600 mb-4">
                        <span className="font-mono text-xs bg-gray-200 px-1 rounded">
                            {keyStart}...
                        </span>{" "}
                        {keyName && `(${keyName})`}
                    </Dialog.Description>

                    {isLoading ? (
                        <div className="py-8 text-center text-gray-500">
                            Loading...
                        </div>
                    ) : (
                        <>
                            {error && (
                                <div className="mb-4 p-2 bg-red-100 border border-red-300 text-red-700 rounded text-sm">
                                    {error}
                                </div>
                            )}
                            <ApiKeySettings
                                value={settings}
                                onChange={setSettings}
                                showTurnstile={isPublishable}
                            />
                            <div className="flex gap-2 justify-end mt-4">
                                <Button
                                    type="button"
                                    weight="outline"
                                    onClick={() => setIsOpen(false)}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="button"
                                    color="blue"
                                    onClick={handleSave}
                                    disabled={isSaving}
                                >
                                    {isSaving ? "Saving..." : "Save"}
                                </Button>
                            </div>
                        </>
                    )}
                </Dialog.Content>
            </Dialog.Positioner>
        </Dialog.Root>
    );
};

export default ApiKeySettings;
