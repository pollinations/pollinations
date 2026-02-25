import { Field } from "@ark-ui/react/field";
import type { FC } from "react";
import { cn } from "@/util.ts";

type PublishableKeySettingsProps = {
    appUrl: string;
    onAppUrlChange: (url: string) => void;
    botProtection: boolean;
    onBotProtectionChange: (enabled: boolean) => void;
    byopEnabled: boolean;
    onByopEnabledChange: (enabled: boolean) => void;
    disabled?: boolean;
};

export const PublishableKeySettings: FC<PublishableKeySettingsProps> = ({
    appUrl,
    onAppUrlChange,
    botProtection,
    onBotProtectionChange,
    byopEnabled,
    onByopEnabledChange,
    disabled = false,
}) => {
    function handleAppUrlChange(value: string) {
        onAppUrlChange(value);
        if (!value) {
            onBotProtectionChange(false);
            onByopEnabledChange(false);
        }
    }

    return (
        <div className="space-y-3">
            <Field.Root className="flex items-center gap-3">
                <Field.Label className="text-sm font-semibold shrink-0">
                    App URL
                </Field.Label>
                <Field.Input
                    type="url"
                    value={appUrl}
                    onChange={(e) => handleAppUrlChange(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600"
                    placeholder="https://myapp.com"
                    disabled={disabled}
                />
            </Field.Root>

            {appUrl && (
                <div
                    className={cn(
                        "rounded-lg border border-gray-200 p-3 space-y-2",
                        disabled && "opacity-50",
                    )}
                >
                    <label
                        className={cn(
                            "flex items-center gap-2 cursor-pointer",
                            disabled && "cursor-not-allowed",
                        )}
                    >
                        <input
                            type="checkbox"
                            checked={botProtection}
                            onChange={(e) =>
                                onBotProtectionChange(e.target.checked)
                            }
                            disabled={disabled}
                            className="w-4 h-4 rounded text-cyan-600"
                        />
                        <span className="text-sm">Bot Protection</span>
                        <span className="text-xs text-gray-400 ml-auto">
                            Turnstile verification
                        </span>
                    </label>
                    <label
                        className={cn(
                            "flex items-center gap-2 cursor-pointer",
                            disabled && "cursor-not-allowed",
                        )}
                    >
                        <input
                            type="checkbox"
                            checked={byopEnabled}
                            onChange={(e) =>
                                onByopEnabledChange(e.target.checked)
                            }
                            disabled={disabled}
                            className="w-4 h-4 rounded text-green-600"
                        />
                        <span className="text-sm">
                            BYOP (Bring Your Own Pollen)
                        </span>
                        <span className="text-xs text-gray-400 ml-auto">
                            Auth redirect flow
                        </span>
                    </label>
                </div>
            )}
        </div>
    );
};
