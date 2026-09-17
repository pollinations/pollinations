import { Button, XIcon } from "@pollinations/ui";
import { ErrorBanner, GitHubSignInButton } from "@pollinations/ui/auth";
import type { ReactNode } from "react";
import { useGitHubSignIn } from "../../hooks/use-github-sign-in.ts";
import { AuthFlowScreen } from "./auth-flow-screen.tsx";

/** The same GitHub sign-in step for Enter's standalone flows. */
export function SignInScreen({
    title,
    description,
    children,
    onCancel,
    callbackURL,
}: {
    title: string;
    description?: string;
    children?: ReactNode;
    onCancel?: () => void;
    callbackURL?: string;
}) {
    const { signIn, isSigningIn, error } = useGitHubSignIn(callbackURL);
    return (
        <AuthFlowScreen
            title={title}
            description={description}
            actions={
                <>
                    {onCancel && (
                        <Button
                            intent="neutral"
                            icon={<XIcon />}
                            onClick={onCancel}
                            disabled={isSigningIn}
                        >
                            Cancel
                        </Button>
                    )}
                    <GitHubSignInButton
                        onClick={signIn}
                        isSigningIn={isSigningIn}
                    />
                </>
            }
        >
            {children}
            {error && <ErrorBanner>{error}</ErrorBanner>}
        </AuthFlowScreen>
    );
}
