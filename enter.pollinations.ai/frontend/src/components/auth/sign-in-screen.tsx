import { Heading } from "@pollinations/ui";
import {
    AuthFlowLayout,
    AuthInfoCard,
    ErrorBanner,
} from "@pollinations/ui/auth";
import type { ReactNode } from "react";

export function SignInScreen({
    app,
    error,
    actions,
    secondaryAction,
}: {
    app?: ReactNode;
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
                <Heading as="h1" size="section" id="sign-in-title">
                    Sign in to pollinations.ai
                </Heading>
                {app && (
                    <>
                        <p className="font-body text-xs font-semibold tracking-wide text-theme-text-soft">
                            to connect:
                        </p>
                        <AuthInfoCard title={null}>{app}</AuthInfoCard>
                    </>
                )}
            </div>
            {error && <ErrorBanner>{error}</ErrorBanner>}
        </AuthFlowLayout>
    );
}
