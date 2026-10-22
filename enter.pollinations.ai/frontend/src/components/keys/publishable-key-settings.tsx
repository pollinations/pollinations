import { Button, Field, InfoTip, Input } from "@pollinations/ui";
import { AuthInfoCard } from "@pollinations/ui/auth";
import { isAllowedRedirectUrl } from "@shared/auth/redirect-uri.ts";
import type { FC } from "react";

/**
 * Pre-filled callback for app keys so local dev works out of the box. Loopback
 * ports are wildcarded (RFC 8252 §7.3), so only the path needs editing. The
 * dev sees it in the editor and should remove it before production.
 */
export const DEFAULT_LOCALHOST_REDIRECT = "http://localhost/callback";

/**
 * First non-empty redirect URL that is invalid, or null. Mirrors
 * validateRedirectUriFormat so mistakes surface before the request is sent,
 * and also catches two URLs pasted into one field.
 */
export function findInvalidRedirectUri(uris: string[]): string | null {
    for (const raw of uris) {
        const uri = raw.trim();
        if (!uri) continue;
        let url: URL;
        try {
            url = new URL(uri);
        } catch {
            return uri;
        }
        if (
            !/^[a-z][a-z0-9+\-.]*:\/\/.+/.test(uri) ||
            url.hash ||
            !isAllowedRedirectUrl(url) ||
            // Two URLs run together, e.g. typed after the pre-filled default.
            url.pathname.includes("://")
        ) {
            return uri;
        }
    }
    return null;
}

export function invalidRedirectUriMessage(uri: string): string {
    return `"${uri}" is not a valid redirect URL. Use https://, or http:// for localhost, without a #fragment.`;
}

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
        <AuthInfoCard
            title={
                <>
                    Redirect URLs
                    <InfoTip
                        text="Your app receives users at these URLs after consent. For local development, match a localhost redirect to your dev server’s path; remove it before production."
                        label="Redirect URLs information"
                    />
                </>
            }
        >
            <div className="space-y-2">
                {redirectUris.map((uri, index) => (
                    <div
                        // biome-ignore lint/suspicious/noArrayIndexKey: stable enough for a small editable list
                        key={index}
                        className="flex items-center gap-2"
                    >
                        <Field.Root className="min-w-0 flex-1">
                            <Field.Label className="sr-only">
                                Redirect URL {index + 1}
                            </Field.Label>
                            <Field.Input asChild>
                                <Input
                                    type="text"
                                    value={uri}
                                    onChange={(e) =>
                                        update(index, e.target.value)
                                    }
                                    // Typing over the pre-filled default should
                                    // replace it, not append to it.
                                    onFocus={(e) => {
                                        if (
                                            uri === DEFAULT_LOCALHOST_REDIRECT
                                        ) {
                                            e.currentTarget.select();
                                        }
                                    }}
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
                            aria-label={`Remove redirect URL ${index + 1}`}
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
            </div>
        </AuthInfoCard>
    );
};
