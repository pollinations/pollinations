import { useState } from "react";
import { authClient } from "../auth.ts";

export function useGitHubSignIn(callbackURL?: string) {
    const [isSigningIn, setIsSigningIn] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function signIn(): Promise<void> {
        setIsSigningIn(true);
        setError(null);
        const { error } = await authClient.signIn.social({
            provider: "github",
            callbackURL: callbackURL ?? window.location.href,
        });
        if (error) {
            setIsSigningIn(false);
            setError(
                "We couldn’t sign you in to your Pollinations account. Please try again.",
            );
        }
    }

    return { isSigningIn, error, signIn };
}
