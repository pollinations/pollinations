import { Button, ExternalLinkIcon, Heading, MailIcon } from "@pollinations/ui";
import { AuthFlowLayout, ErrorBanner } from "@pollinations/ui/auth";
import { createFileRoute } from "@tanstack/react-router";
import { getLoginError } from "../lib/login-errors";
import { getSignInContext } from "../lib/sign-in-context";

export const Route = createFileRoute("/error")({
    component: ErrorPage,
    validateSearch: (search: Record<string, unknown>) => ({
        error: typeof search.error === "string" ? search.error : "",
    }),
});

function ErrorPage() {
    const { error } = Route.useSearch();
    const { id, title, message, action } = getLoginError(error);
    const isBanned = id === "account-deactivated";
    const href =
        id === "login-failed"
            ? (getSignInContext()?.path ?? action.href)
            : action.href;

    return (
        <AuthFlowLayout
            dialog={{ labelledBy: "login-error-title" }}
            actions={
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
                className="py-3"
            >
                {title}
            </Heading>
            <ErrorBanner>{message}</ErrorBanner>
        </AuthFlowLayout>
    );
}
