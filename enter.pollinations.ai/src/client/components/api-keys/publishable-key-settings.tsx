import { Field } from "@ark-ui/react/field";
import type { FC } from "react";
import { Button } from "../button.tsx";
import { Switch } from "../ui/switch.tsx";

type PublishableKeySettingsProps = {
    redirectUris: string[];
    onRedirectUrisChange: (uris: string[]) => void;
    earningsEnabled?: boolean;
    onEarningsEnabledChange?: (enabled: boolean) => void;
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
    earningsEnabled = false,
    onEarningsEnabledChange,
    disabled = false,
}) => {
    function update(index: number, value: string) {
        const next = [...redirectUris];
        next[index] = value;
        onRedirectUrisChange(next);
    }

    function add() {
        onRedirectUrisChange([...redirectUris, ""]);
    }

    function remove(index: number) {
        const next = redirectUris.filter((_, i) => i !== index);
        onRedirectUrisChange(next);
    }

    return (
        <div className="space-y-5">
            <Field.Root className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    <Field.Label className="text-sm font-semibold">
                        Redirect URIs
                    </Field.Label>
                </div>
                {redirectUris.map((uri, index) => (
                    <div
                        // biome-ignore lint/suspicious/noArrayIndexKey: stable enough for a small editable list
                        key={index}
                        className="flex items-center gap-2"
                    >
                        <Field.Input
                            type="text"
                            value={uri}
                            onChange={(e) => update(index, e.target.value)}
                            className="flex-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
                            placeholder="https://myapp.com/auth/callback"
                            disabled={disabled}
                        />
                        <Button
                            type="button"
                            color="blue"
                            weight="outline"
                            onClick={() => remove(index)}
                            disabled={disabled}
                        >
                            Remove
                        </Button>
                    </div>
                ))}
                <div>
                    <Button
                        type="button"
                        color="blue"
                        weight="light"
                        onClick={add}
                        disabled={disabled}
                    >
                        + Add
                    </Button>
                </div>
            </Field.Root>
            {onEarningsEnabledChange && (
                <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="text-sm font-semibold">
                            Developer earnings
                        </div>
                        <p className="mt-0.5 text-xs text-blue-800/75">
                            Users pay 25% over base rates. Markup credits to
                            your balance.
                        </p>
                    </div>
                    <Switch
                        checked={earningsEnabled}
                        onChange={onEarningsEnabledChange}
                        disabled={disabled}
                        ariaLabel={
                            earningsEnabled
                                ? "Turn off developer earnings"
                                : "Enable developer earnings"
                        }
                    />
                </div>
            )}
        </div>
    );
};
