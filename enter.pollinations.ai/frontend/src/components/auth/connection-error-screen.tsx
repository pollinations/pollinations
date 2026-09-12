import { Button, InlineLink } from "@pollinations/ui";
import { AuthFlowLayout, ErrorBanner } from "@pollinations/ui/auth";
import type { ReactNode } from "react";

export function ConnectionErrorScreen({
    app,
    account,
    error,
    verified,
    operation = "connect",
    pending,
    onRetry,
    onBack,
    retryLabel = "Try again",
    backLabel = "Back to app",
    recoveryHint = "Open this connection from the app.",
}: {
    app: ReactNode;
    account?: ReactNode;
    error: string;
    verified: boolean;
    operation?: "connect" | "decline";
    pending: boolean;
    onRetry?: () => void;
    onBack?: () => void;
    retryLabel?: string;
    backLabel?: string;
    recoveryHint?: string;
}) {
    return (
        <AuthFlowLayout
            dialog={{ labelledBy: "connection-error-title" }}
            account={account}
            actions={
                onRetry && (
                    <Button onClick={onRetry} disabled={pending}>
                        {retryLabel}
                    </Button>
                )
            }
            secondaryAction={
                onBack && (
                    <Button
                        onClick={onBack}
                        disabled={pending}
                        data-theme="neutral"
                    >
                        {backLabel}
                    </Button>
                )
            }
        >
            <div className="space-y-2 pt-3">
                <div>{app}</div>
                <p className="font-body text-xs font-semibold tracking-wide text-theme-text-soft">
                    {operation === "decline"
                        ? "requested access"
                        : verified
                          ? "could not connect"
                          : "cannot connect"}{" "}
                    to your{" "}
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
                    <p className="mt-2">{recoveryHint}</p>
                )}
            </ErrorBanner>
        </AuthFlowLayout>
    );
}
