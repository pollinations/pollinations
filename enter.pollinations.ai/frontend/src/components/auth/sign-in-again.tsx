import { ErrorBanner, GitHubSignInButton } from "@pollinations/ui/auth";
import { useGitHubSignIn } from "../../hooks/use-github-sign-in.ts";

/** Reauthenticate and return to the current route, including its search parameters. */
export function SignInAgain() {
    const { signIn, isSigningIn, error } = useGitHubSignIn();
    return (
        <div className="space-y-3">
            {error && <ErrorBanner>{error}</ErrorBanner>}
            <GitHubSignInButton
                onClick={signIn}
                isSigningIn={isSigningIn}
                retry
                retryLabel="Sign in again"
            />
        </div>
    );
}
