import { Button, Field, Input, Text } from "@pollinations/ui";
import { AuthInfoCard } from "@pollinations/ui/auth";
import type { FC } from "react";

type PublishableKeySettingsProps = {
    redirectUris: string[];
    onRedirectUrisChange: (uris: string[]) => void;
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
        <AuthInfoCard title={null}>
            <div className="space-y-3">
                <div>
                    <Text
                        size="sm"
                        weight="semibold"
                        tone="strong"
                        className="polli:leading-5"
                    >
                        Callback URLs
                    </Text>
                    <Text size="xs" tone="muted" className="polli:mt-1">
                        Where your app receives users after consent.
                    </Text>
                </div>
                {redirectUris.map((uri, index) => (
                    <div
                        // biome-ignore lint/suspicious/noArrayIndexKey: stable enough for a small editable list
                        key={index}
                        className="flex items-center gap-2"
                    >
                        <Field.Root className="min-w-0 flex-1">
                            <Field.Label className="sr-only">
                                Callback URL {index + 1}
                            </Field.Label>
                            <Field.Input asChild>
                                <Input
                                    type="text"
                                    value={uri}
                                    onChange={(e) =>
                                        update(index, e.target.value)
                                    }
                                    className="w-full"
                                    placeholder="https://myapp.com/auth/callback"
                                    disabled={disabled}
                                />
                            </Field.Input>
                        </Field.Root>
                        <Button
                            type="button"
                            size="sm"
                            data-theme="neutral"
                            className="polli:shrink-0"
                            aria-label={`Remove callback URL ${index + 1}`}
                            onClick={() => remove(index)}
                            disabled={disabled}
                        >
                            Remove
                        </Button>
                    </div>
                ))}
                <Button
                    type="button"
                    size="sm"
                    data-theme="neutral"
                    onClick={add}
                    disabled={disabled}
                >
                    Add URL
                </Button>
                <Text size="xs" tone="muted">
                    Use a localhost callback for local development. Match the
                    path to your dev server, and remove it before production.
                </Text>
            </div>
        </AuthInfoCard>
    );
};
