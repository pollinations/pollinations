import { Field } from "@ark-ui/react/field";
import type { FC } from "react";
import { Button } from "../button.tsx";

type PublishableKeySettingsProps = {
    redirectUris: string[];
    onRedirectUrisChange: (uris: string[]) => void;
    disabled?: boolean;
};

/**
 * List editor for redirect URIs registered against a publishable key.
 *
 * Each entry is an allowed OAuth callback URL for `/authorize`. Loopback
 * entries (localhost / 127.0.0.1 / ::1) match any port (RFC 8252 §7.3) so
 * native/CLI apps don't need to register every ephemeral port.
 */
export const PublishableKeySettings: FC<PublishableKeySettingsProps> = ({
    redirectUris,
    onRedirectUrisChange,
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
        <Field.Root className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
                <Field.Label className="text-sm font-semibold">
                    Redirect URIs
                </Field.Label>
                <span className="text-xs text-gray-600">
                    Loopback URLs match any port (RFC 8252).
                </span>
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
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-green-100 focus:outline-none focus:ring-2 focus:ring-green-600"
                        placeholder="https://myapp.com/auth/callback"
                        disabled={disabled}
                    />
                    {rows.length > 1 && (
                        <Button
                            type="button"
                            weight="outline"
                            onClick={() => remove(index)}
                            disabled={disabled}
                        >
                            Remove
                        </Button>
                    )}
                </div>
            ))}
            <div>
                <Button
                    type="button"
                    weight="outline"
                    onClick={add}
                    disabled={disabled}
                >
                    + Add redirect URI
                </Button>
            </div>
        </Field.Root>
    );
};
