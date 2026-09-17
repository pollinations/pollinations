import { Button, ColorModeToggle, Heading, Text } from "@pollinations/ui";
import {
    AuthFlowLayout,
    ErrorBanner,
    GitHubSignInButton,
} from "@pollinations/ui/auth";
import type { ReactNode } from "react";
import { useGitHubSignIn } from "../../hooks/use-github-sign-in.ts";

/** The same GitHub sign-in step for Enter's standalone flows. */
export function SignInScreen({
    title,
    description,
    children,
    onCancel,
    callbackURL,
}: {
    title: string;
    description: string;
    children?: ReactNode;
    onCancel?: () => void;
    callbackURL?: string;
}) {
    const { signIn, isSigningIn, error } = useGitHubSignIn(callbackURL);
    return (
        <AuthFlowLayout
            dialog={{ labelledBy: "sign-in-title" }}
            headerAction={<ColorModeToggle />}
            actions={
                <>
                    {onCancel && (
                        <Button
                            intent="neutral"
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
            <Heading as="h1" size="section" id="sign-in-title">
                {title}
            </Heading>
            <Text size="sm">{description}</Text>
            {children}
            {error && <ErrorBanner>{error}</ErrorBanner>}
        </AuthFlowLayout>
    );
}
