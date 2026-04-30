import { Field } from "@ark-ui/react/field";
import type { FC } from "react";
import { cn } from "@/util.ts";
import { Button } from "../button.tsx";
import { InfoTip } from "../ui/info-tip.tsx";

type PublishableKeySettingsProps = {
    redirectUris: string[];
    onRedirectUrisChange: (uris: string[]) => void;
    byopEnabled?: boolean;
    onByopEnabledChange?: (enabled: boolean) => void;
    disabled?: boolean;
};

/**
 * List editor for redirect URLs registered against a publishable key.
 *
 * Each entry is an allowed OAuth callback URL for `/authorize`. Loopback
 * entries (localhost / 127.0.0.1 / ::1) match any port (RFC 8252 §7.3) so
 * native/CLI apps don't need to register every ephemeral port.
 */
export const PublishableKeySettings: FC<PublishableKeySettingsProps> = ({
    redirectUris,
    onRedirectUrisChange,
    byopEnabled = false,
    onByopEnabledChange,
    disabled = false,
}) => {
    const rows = redirectUris.length > 0 ? redirectUris : [""];

    function update(index: number, value: string) {
        const next = [...rows];
        next[index] = value;
        onRedirectUrisChange(next.filter((v) => v !== "" || rows.length === 1));
    }

    function add() {
        onRedirectUrisChange([...rows, ""]);
    }

    function remove(index: number) {
        const next = rows.filter((_, i) => i !== index);
        onRedirectUrisChange(next);
    }

    return (
        <div className="space-y-5">
            <Field.Root className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    <Field.Label className="text-sm font-semibold">
                        Redirect URLs
                    </Field.Label>
                    <Button
                        type="button"
                        color="blue"
                        weight="light"
                        onClick={add}
                        disabled={disabled}
                    >
                        + Add redirect URL
                    </Button>
                </div>
                {rows.map((uri, index) => (
                    <div
                        // biome-ignore lint/suspicious/noArrayIndexKey: stable enough for a small editable list
                        key={index}
                        className="flex items-center gap-2"
                    >
                        <Field.Input
                            type="text"
                            value={uri}
                            onChange={(e) => update(index, e.target.value)}
                            className="flex-1 rounded-lg border border-blue-300 bg-blue-100 px-3 py-2 text-blue-950 placeholder:text-blue-700/55 focus:outline-none focus-visible:border-blue-500 focus-visible:ring-1 focus-visible:ring-blue-500/60"
                            placeholder="https://myapp.com/auth/callback"
                            disabled={disabled}
                        />
                        {rows.length > 1 && (
                            <Button
                                type="button"
                                color="blue"
                                weight="outline"
                                onClick={() => remove(index)}
                                disabled={disabled}
                            >
                                Remove
                            </Button>
                        )}
                    </div>
                ))}
                <p className="text-xs text-blue-800/70">
                    Loopback URLs match any port (RFC 8252).
                </p>
            </Field.Root>
            {onByopEnabledChange && (
                <DeveloperEarningsSwitch
                    enabled={byopEnabled}
                    disabled={disabled}
                    onToggle={onByopEnabledChange}
                />
            )}
        </div>
    );
};

type DeveloperEarningsSwitchProps = {
    enabled: boolean;
    disabled?: boolean;
    onToggle: (enabled: boolean) => void;
};

const DeveloperEarningsSwitch: FC<DeveloperEarningsSwitchProps> = ({
    enabled,
    disabled = false,
    onToggle,
}) => (
    <div className="flex w-fit min-w-0 items-center gap-3">
        <div className="min-w-0">
            <div className="flex min-w-0 items-center text-sm font-semibold text-blue-950">
                Developer earnings
                <InfoTip
                    text="BYOP app requests include a 25% markup. App developers receive 20% of the total Pollen charged."
                    label="Developer earnings information"
                    tone="blue"
                    placement="top"
                />
            </div>
            <div className="text-xs font-medium text-blue-800/75">
                {enabled ? "On" : "Off"}
            </div>
        </div>
        <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label={
                enabled
                    ? "Turn off developer earnings"
                    : "Enable developer earnings"
            }
            onClick={() => onToggle(!enabled)}
            disabled={disabled}
            className={cn(
                "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-60",
                enabled
                    ? "border-blue-300 bg-blue-200"
                    : "border-blue-300 bg-blue-100",
            )}
        >
            <span
                className={cn(
                    "inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
                    enabled ? "translate-x-6" : "translate-x-1",
                )}
            />
        </button>
    </div>
);
