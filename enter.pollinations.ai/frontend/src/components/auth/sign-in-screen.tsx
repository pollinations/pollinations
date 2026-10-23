import { Button, XIcon } from "@pollinations/ui";
import { GitHubSignInButton, GoogleSignInButton } from "@pollinations/ui/auth";
import type { ReactNode } from "react";
import { useSocialSignIn } from "../../hooks/use-social-sign-in.ts";
import { AuthFlowScreen } from "./auth-flow-screen.tsx";

/** The same GitHub or Google sign-in step for Enter's standalone flows. */
export function SignInScreen({
    title,
    subject,
    description,
    children,
    onCancel,
    callbackURL,
}: {
    title: string;
    subject?: ReactNode;
    description?: string;
    children?: ReactNode;
    onCancel?: () => void;
    callbackURL?: string;
}) {
    const { signIn, signingInWith, error } = useSocialSignIn(callbackURL);
    return (
        <AuthFlowScreen
            title={title}
            subject={subject}
            description={description}
            error={error}
            onClose={onCancel}
            actions={
                <>
                    <GitHubSignInButton
                        className="w-full"
                        onClick={() => void signIn("github")}
                        isSigningIn={signingInWith === "github"}
                        disabled={signingInWith === "google"}
                    />
                    <GoogleSignInButton
                        className="w-full"
                        onClick={() => void signIn("google")}
                        isSigningIn={signingInWith === "google"}
                        disabled={signingInWith === "github"}
                    />
                    {onCancel && (
                        <Button
                            intent="neutral"
                            icon={<XIcon />}
                            onClick={onCancel}
                            disabled={signingInWith !== null}
                        >
                            Cancel
                        </Button>
                    )}
                </>
            }
        >
            {children}
        </AuthFlowScreen>
    );
}
