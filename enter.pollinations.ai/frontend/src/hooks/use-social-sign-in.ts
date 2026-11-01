import { useState } from "react";
import { authClient } from "../auth.ts";

export type SignInProvider = "github" | "google";

export function useSocialSignIn(callbackURL?: string) {
    const [signingInWith, setSigningInWith] = useState<SignInProvider | null>(
        null,
    );
    const [error, setError] = useState<string | null>(null);

    async function signIn(provider: SignInProvider): Promise<void> {
        setSigningInWith(provider);
        setError(null);
        const { error } = await authClient.signIn.social({
            provider,
            callbackURL: callbackURL ?? window.location.href,
        });
        if (error) {
            setSigningInWith(null);
            setError(
                "We couldn’t sign you in to your Pollinations account. Please try again.",
            );
        }
    }

    return { signingInWith, error, signIn };
}
