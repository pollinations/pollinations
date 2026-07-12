import { useState } from "react";
import { authClient } from "../auth.ts";

export function useGitHubSignIn() {
    const [isSigningIn, setIsSigningIn] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function signIn(): Promise<void> {
        setIsSigningIn(true);
        setError(null);
        const { error } = await authClient.signIn.social({
            provider: "github",
            callbackURL: window.location.href,
        });
        if (error) {
            setIsSigningIn(false);
            setError("Sign in failed. Please try again.");
        }
    }

    return { isSigningIn, error, signIn };
}
