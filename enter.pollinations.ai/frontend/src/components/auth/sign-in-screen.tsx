import { Heading, InlineLink } from "@pollinations/ui";
import {
    AuthFlowLayout,
    AuthInfoCard,
    ErrorBanner,
} from "@pollinations/ui/auth";
import type { ReactNode } from "react";

export function SignInScreen({
    app,
    appFirst = false,
    title = "Sign in to pollinations.ai",
    error,
    actions,
    secondaryAction,
}: {
    app?: ReactNode;
    appFirst?: boolean;
    title?: string;
    error?: string | null;
    actions: ReactNode;
    secondaryAction?: ReactNode;
}) {
    return (
        <AuthFlowLayout
            dialog={{ labelledBy: "sign-in-title" }}
            actions={actions}
            secondaryAction={secondaryAction}
        >
            <div className="space-y-2 pt-3">
                {appFirst && app ? (
                    <>
                        <div>{app}</div>
                        <p className="font-body text-xs font-semibold tracking-wide text-theme-text-soft">
                            wants to connect to your{" "}
                            <InlineLink
                                href="https://pollinations.ai/"
                                className="polli:font-semibold"
                            >
                                pollinations.ai account
                            </InlineLink>
                            .
                        </p>
                    </>
                ) : (
                    <>
                        <Heading as="h1" size="section" id="sign-in-title">
                            {title}
                        </Heading>
                        {app && (
                            <>
                                <p className="font-body text-xs font-semibold tracking-wide text-theme-text-soft">
                                    to connect:
                                </p>
                                <AuthInfoCard title={null}>{app}</AuthInfoCard>
                            </>
                        )}
                    </>
                )}
            </div>
            {error && <ErrorBanner>{error}</ErrorBanner>}
        </AuthFlowLayout>
    );
}
