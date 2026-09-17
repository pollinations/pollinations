import { ArrowRightIcon, Button, MailIcon } from "@pollinations/ui";
import { AuthErrorContent, AuthFlowLayout } from "@pollinations/ui/auth";
import { isBannedLoginError } from "@shared/auth/ban.ts";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/error")({
    component: ErrorPage,
    validateSearch: (search: Record<string, unknown>) => ({
        error: (search.error as string) || "",
    }),
});

function ErrorPage() {
    const { error } = Route.useSearch();
    const isBanned = isBannedLoginError(error);
    const isStagingInviteOnly = error === "staging_is_invite-only";

    const title = isBanned
        ? "Account suspended"
        : isStagingInviteOnly
          ? "Staging is invite-only"
          : "Couldn’t sign in";
    const message = isBanned
        ? "Your pollinations.ai account is suspended. If you think this is a mistake, contact billing."
        : isStagingInviteOnly
          ? "Your pollinations.ai account doesn’t have access to staging. Use pollinations.ai to continue."
          : "We couldn’t sign you in to your pollinations.ai account. Please try again.";

    return (
        <AuthFlowLayout
            dialog={{ labelledBy: "login-error-title" }}
            actions={
                <>
                    {isBanned && (
                        <Button
                            as="a"
                            intent="neutral"
                            icon={<MailIcon />}
                            href="mailto:billing@pollinations.ai"
                        >
                            Contact billing
                        </Button>
                    )}
                    <Button as="a" icon={<ArrowRightIcon />} href="/">
                        Go to dashboard
                    </Button>
                </>
            }
        >
            <AuthErrorContent
                title={title}
                titleId="login-error-title"
                message={message}
            />
        </AuthFlowLayout>
    );
}
