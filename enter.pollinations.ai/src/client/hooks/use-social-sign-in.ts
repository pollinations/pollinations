import { useState } from "react";
import { authClient } from "../auth.ts";
import type { SocialProvider } from "../lib/social-providers.ts";

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
        isSigningIn: pendingProvider !== null,
        pendingProvider,
        error,
        signIn,
    };
}
