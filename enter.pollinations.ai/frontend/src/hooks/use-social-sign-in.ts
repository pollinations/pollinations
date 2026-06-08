import { useState } from "react";
import { authClient } from "../auth.ts";
import type { SocialProvider } from "../lib/social-providers.ts";

/**
 * Starts a social OAuth sign-in and tracks which provider is mid-flight so the
 * buttons can show per-provider pending state. Returns to the current URL after
 * the OAuth round-trip.
 */
export function useSocialSignIn() {
    const [pendingProvider, setPendingProvider] =
        useState<SocialProvider | null>(null);
    const [error, setError] = useState<string | null>(null);

    async function signIn(provider: SocialProvider): Promise<void> {
        setPendingProvider(provider);
        setError(null);
        const { error } = await authClient.signIn.social({
            provider,
            callbackURL: window.location.href,
        });
        if (error) {
            setPendingProvider(null);
            setError("Sign in failed. Please try again.");
        }
    }

    return {
        pendingProvider,
        isSigningIn: pendingProvider !== null,
        error,
        signIn,
    };
}
