import { loginErrors } from "@shared/auth/login-errors.ts";
import { useState } from "react";
import { authClient } from "../auth.ts";
import { rememberSignIn } from "../lib/sign-in-context.ts";

const signInErrorMessage = `${loginErrors.default.title}. ${loginErrors.default.message}`;

export function useGitHubSignIn(callbackURL?: string, failed = false) {
    const [isSigningIn, setIsSigningIn] = useState(false);
    const [error, setError] = useState<string | null>(
        failed ? signInErrorMessage : null,
    );

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
        setError(signInErrorMessage);
    }

    return { isSigningIn, error, signIn };
}
