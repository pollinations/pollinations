import { getLoginError } from "@shared/auth/login-errors.ts";
import { Button, ExternalLinkIcon, Heading, MailIcon } from "@pollinations/ui";
import {
    AuthFlowLayout,
    ErrorBanner,
    GitHubSignInButton,
} from "@pollinations/ui/auth";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { SignInScreen } from "../components/auth/sign-in-screen";
import { appSignInErrorPath, getSignInContext } from "../lib/sign-in-context";

export const Route = createFileRoute("/error")({
    component: ErrorPage,
    validateSearch: (search: Record<string, unknown>) => ({
        error: typeof search.error === "string" ? search.error : "",
    }),
    beforeLoad: ({ search }) => {
        if (getLoginError(search.error).id !== "login-failed") return;
        const context = getSignInContext();
        const href = context && appSignInErrorPath(context.path);
        if (href) throw redirect({ href, replace: true });
    },
});

function ErrorPage() {
    const { error } = Route.useSearch();
    const { id, title, message, action } = getLoginError(error);
    const isBanned = id === "account-deactivated";
    const href =
        id === "login-failed"
            ? (getSignInContext()?.path ?? action.href)
            : action.href;

    if (id === "login-failed")
        return (
            <SignInScreen
                error={message}
                actions={
                    <GitHubSignInButton
                        retry
                        onClick={() => location.assign(href)}
                    />
                }
            />
        );

    return (
        <AuthFlowLayout
            dialog={{ labelledBy: "login-error-title" }}
            actions={null}
            secondaryAction={
                <Button as="a" href={href} className="polli:rounded-md gap-2">
                    {isBanned && (
                        <MailIcon aria-hidden="true" className="h-4 w-4" />
                    )}
                    {action.label}
                    {action.href.startsWith("https:") && (
                        <ExternalLinkIcon
                            aria-hidden="true"
                            className="h-3.5 w-3.5"
                        />
                    )}
                </Button>
            }
        >
            <Heading
                as="h1"
                size="section"
                id="login-error-title"
                className="pt-3"
            >
                {title}
            </Heading>
            <ErrorBanner>{message}</ErrorBanner>
        </AuthFlowLayout>
    );
}
