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
        <Field.Root className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
                <Field.Label className="text-sm font-semibold">
                    Redirect URIs
                </Field.Label>
                <span className="text-xs text-gray-600">
                    Loopback URLs match any port (RFC 8252).
                </span>
            </div>
            {redirectUris.length === 0 && (
                <p className="rounded-lg border border-dashed border-blue-200 bg-blue-50 px-3 py-2 text-sm text-gray-500">
                    No redirect URIs
                </p>
            )}
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
                    + Add redirect URI
                </Button>
            </div>
        </Field.Root>
    );
};
