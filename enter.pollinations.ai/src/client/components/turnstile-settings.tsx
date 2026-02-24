import type { FC } from "react";
import { useState } from "react";
import { cn } from "@/util.ts";

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

export default TurnstileSettings;
