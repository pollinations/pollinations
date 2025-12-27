import { Dialog } from "@ark-ui/react/dialog";
import { type FC, useState, useEffect, useCallback } from "react";
import { cn } from "@/util.ts";
import { Button } from "./button.tsx";

export interface TurnstileSettingsData {
    enabled: boolean;
    hostnames: string[];
}

type TurnstileSettingsProps = {
    value: TurnstileSettingsData;
    onChange: (settings: TurnstileSettingsData) => void;
    disabled?: boolean;
};

/**
 * Reusable Turnstile settings component - controlled like ModelPermissions.
 * Shows toggle + hostname management for bot protection.
 */
export const TurnstileSettings: FC<TurnstileSettingsProps> = ({
    value,
    onChange,
    disabled = false,
}) => {
    const [newHostname, setNewHostname] = useState("");

    const addHostname = () => {
        const hostname = newHostname.trim().toLowerCase();
        if (hostname && !value.hostnames.includes(hostname)) {
            onChange({ ...value, hostnames: [...value.hostnames, hostname] });
            setNewHostname("");
        }
    };

    const removeHostname = (hostname: string) => {
        onChange({
            ...value,
            hostnames: value.hostnames.filter((h) => h !== hostname),
        });
    };

    return (
        <div
            className={cn(
                "rounded-lg border border-gray-200 transition-all p-3 space-y-3",
                !disabled && "hover:border-gray-300",
                disabled && "opacity-50",
            )}
        >
            {/* Enable toggle */}
            <label
                className={cn(
                    "flex items-center gap-2 cursor-pointer",
                    disabled && "cursor-not-allowed",
                )}
            >
                <input
                    type="checkbox"
                    checked={value.enabled}
                    onChange={(e) =>
                        onChange({ ...value, enabled: e.target.checked })
                    }
                    disabled={disabled}
                    className="w-4 h-4 rounded text-cyan-600"
                />
                <span className="text-sm font-medium">
                    🛡️ Enable Bot Protection
                </span>
                <span
                    className={cn(
                        "text-xs px-2 py-0.5 rounded-full ml-auto border",
                        value.enabled
                            ? "bg-cyan-100 text-cyan-700 border-cyan-300"
                            : "bg-gray-100 text-gray-500 border-gray-200",
                    )}
                >
                    {value.enabled ? "Enabled" : "Disabled"}
                </span>
            </label>

            {/* Hostnames - only shown when enabled */}
            {value.enabled && (
                <div className="space-y-2 pt-2 border-t border-gray-100">
                    <div className="text-xs text-gray-500">
                        Allowed hostnames (leave empty for any hostname)
                    </div>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={newHostname}
                            onChange={(e) => setNewHostname(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    addHostname();
                                }
                            }}
                            placeholder="example.com"
                            disabled={disabled}
                            className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
                        />
                        <button
                            type="button"
                            onClick={addHostname}
                            disabled={disabled || !newHostname.trim()}
                            className="px-3 py-1 bg-cyan-100 text-cyan-700 border border-cyan-300 rounded text-sm hover:bg-cyan-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Add
                        </button>
                    </div>
                    {value.hostnames.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {value.hostnames.map((hostname) => (
                                <span
                                    key={hostname}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-cyan-50 text-cyan-700 border border-cyan-200 rounded-full text-xs"
                                >
                                    {hostname}
                                    <button
                                        type="button"
                                        onClick={() => removeHostname(hostname)}
                                        disabled={disabled}
                                        className="hover:text-cyan-900"
                                    >
                                        ×
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

/**
 * Dialog wrapper for editing Turnstile settings on existing API keys.
 * Fetches status on mount to show in button.
 */
export const TurnstileSettingsDialog: FC<{
    keyId: string;
    keyName: string;
    onSave: () => void;
}> = ({ keyId, keyName, onSave }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [settings, setSettings] = useState<TurnstileSettingsData>({
        enabled: false,
        hostnames: [],
    });
    const [error, setError] = useState<string | null>(null);

    const fetchSettings = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await fetch(`/api/api-keys/${keyId}/turnstile`, {
                credentials: "include",
            });
            if (response.ok) {
                const data = await response.json();
                setSettings(data.turnstile);
            }
        } catch (err) {
            setError("Failed to load settings");
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    }, [keyId]);

    // Fetch on mount to show status in button
    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    // Also refetch when dialog opens (in case settings changed elsewhere)
    useEffect(() => {
        if (isOpen) fetchSettings();
    }, [isOpen, fetchSettings]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const response = await fetch(`/api/api-keys/${keyId}/turnstile`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(settings),
            });
            if (response.ok) {
                onSave();
                setIsOpen(false);
            }
        } catch (err) {
            setError("Failed to save");
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
                    className={cn(
                        "text-xs px-2 py-1 rounded border transition-colors cursor-pointer",
                        settings.enabled
                            ? "bg-cyan-100 text-cyan-700 border-cyan-300 hover:bg-cyan-200"
                            : "bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200",
                    )}
                >
                    {settings.enabled ? "🛡️ On" : "🛡️ Off"}
                </button>
            </Dialog.Trigger>
            <Dialog.Backdrop className="fixed inset-0 bg-green-950/50 z-[100]" />
            <Dialog.Positioner className="fixed inset-0 flex items-center justify-center p-4 z-[100]">
                <Dialog.Content className="bg-green-100 border-green-950 border-4 rounded-lg shadow-lg max-w-md w-full p-6">
                    <Dialog.Title className="text-lg font-semibold mb-1">
                        🛡️ Bot Protection
                    </Dialog.Title>
                    <Dialog.Description className="text-sm text-gray-600 mb-4">
                        Cloudflare Turnstile for{" "}
                        <span className="font-mono text-xs bg-gray-200 px-1 rounded">
                            {keyName}
                        </span>
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
                            <TurnstileSettings
                                value={settings}
                                onChange={setSettings}
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

export default TurnstileSettings;
