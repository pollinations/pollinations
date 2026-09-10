import { useState } from "react";
import { authClient } from "../auth.ts";
import { rememberSignIn } from "../lib/sign-in-context.ts";

export function useGitHubSignIn(callbackURL?: string) {
    const [isSigningIn, setIsSigningIn] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function signIn(): Promise<void> {
        if (isSigningIn) return;
        setIsSigningIn(true);
        setError(null);
        rememberSignIn(callbackURL ?? window.location.href);
        try {
            const { error } = await authClient.signIn.social({
                provider: "github",
                callbackURL: callbackURL ?? window.location.href,
            });
            if (!error) return;
        } catch {
            // A network failure must not leave every sign-in control disabled.
        }
        setIsSigningIn(false);
        setError("Could not connect to GitHub. Please try again.");
    }

    return { isSigningIn, error, signIn };
}
