import { Button, Surface } from "@pollinations/ui";
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
        ? "Account Deactivated"
        : isStagingInviteOnly
          ? "Staging is invite-only"
          : "Something went wrong";
    const message = isBanned
        ? "Your account has been deactivated. If you think this is a mistake, contact billing."
        : isStagingInviteOnly
          ? "This is the staging environment and access is limited to the Pollinations team. Head to pollinations.ai to use the production app."
          : "An unexpected error occurred. Please try again or open a GitHub issue if this keeps happening.";

    return (
        <div className="flex min-h-screen items-center justify-center px-4">
            <Surface
                variant="card"
                className="w-full max-w-md p-8 text-center shadow-lg"
            >
                {isBanned && (
                    <a
                        href="https://pollinations.ai/"
                        className="block mb-6 font-heading"
                    >
                        Pollinations
                    </a>
                )}
                <h1 className="font-heading text-3xl mb-3">{title}</h1>

                <p className="font-body text-theme-text-base mb-6 leading-relaxed">
                    {message}
                </p>

                <div className="flex flex-col gap-3">
                    <Button as="a" size="lg" href="/" className="mt-2">
                        Go to Home →
                    </Button>
                    {isBanned && (
                        <Button
                            as="a"
                            size="lg"
                            href="mailto:billing@pollinations.ai"
                        >
                            Contact billing
                        </Button>
                    )}
                </div>

                <div className="mt-8 text-sm text-theme-text-soft">
                    {isBanned ? (
                        <a href="https://pollinations.ai/terms">
                            Terms &amp; Conditions
                        </a>
                    ) : (
                        "pollinations.ai"
                    )}
                </div>
            </Surface>
        </div>
    );
}
