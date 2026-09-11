import { Button, InlineLink } from "@pollinations/ui";
import { AuthFlowLayout, ErrorBanner } from "@pollinations/ui/auth";
import type { ReactNode } from "react";

export function ConnectionErrorScreen({
    app,
    account,
    error,
    verified,
    pending,
    onRetry,
    onBack,
}: {
    app: ReactNode;
    account?: ReactNode;
    error: string;
    verified: boolean;
    pending: boolean;
    onRetry?: () => void;
    onBack?: () => void;
}) {
    return (
        <AuthFlowLayout
            dialog={{ labelledBy: "connection-error-title" }}
            account={account}
            actions={
                onRetry && (
                    <Button onClick={onRetry} className="polli:rounded-md">
                        Try again
                    </Button>
                )
            }
            secondaryAction={
                onBack && (
                    <Button
                        onClick={onBack}
                        data-theme="neutral"
                        className="polli:rounded-md"
                    >
                        Back to app
                    </Button>
                )
            }
        >
            <div className="space-y-2 pt-3">
                <div>{app}</div>
                <p className="font-body text-xs font-semibold tracking-wide text-theme-text-soft">
                    {verified ? "could not connect" : "cannot connect"} to your{" "}
                    <InlineLink
                        href="https://pollinations.ai/"
                        className="polli:font-semibold"
                    >
                        pollinations.ai account
                    </InlineLink>
                    .
                </p>
            </div>
            <ErrorBanner>
                {error}
                {!pending && !onBack && !onRetry && (
                    <p className="mt-2">Open this connection from the app.</p>
                )}
            </ErrorBanner>
        </AuthFlowLayout>
    );
}
