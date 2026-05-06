import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/error")({
    component: ErrorPage,
    validateSearch: (search: Record<string, unknown>) => ({
        error: (search.error as string) || "",
    }),
});

function ErrorPage() {
    const { error } = Route.useSearch();
    const isBanned = error === "banned";
    const isLinkedToDifferentUser =
        error === "account_already_linked_to_different_user";
    const title = isBanned
        ? "Account Deactivated"
        : isLinkedToDifferentUser
          ? "Login method already connected"
          : "Something went wrong";
    const message = isBanned
        ? "Your account has been deactivated. This might be a mistake — reach out and we'll sort it out together."
        : isLinkedToDifferentUser
          ? "That login method is already connected to another Pollinations account. Sign in with that account first if you need to disconnect it."
          : "An unexpected error occurred. Please try again or open a GitHub issue if this keeps happening.";

    return (
        <div className="min-h-screen flex items-start justify-center overflow-y-auto bg-emerald-100 px-4 py-6">
            <div
                role="alertdialog"
                aria-labelledby="error-title"
                aria-describedby="error-message"
                className="my-auto w-full max-w-md rounded-lg border-4 border-green-950 bg-red-50 p-8 text-center shadow-lg"
            >
                <img
                    src="/logo.svg"
                    alt="pollinations.ai"
                    className="mx-auto mb-4 h-12 w-12 object-contain invert"
                />

                <h1
                    id="error-title"
                    className="font-heading mb-3 text-3xl text-green-950"
                >
                    {title}
                </h1>

                <p
                    id="error-message"
                    className="font-body mb-6 leading-relaxed text-red-900"
                >
                    {message}
                </p>

                <div className="flex flex-col items-center gap-3">
                    {isBanned && (
                        <a
                            href="https://github.com/pollinations/pollinations/issues/new?title=Account+deactivated&body=Hi%2C+my+account+has+been+deactivated+and+I+believe+this+may+be+a+mistake.+Could+you+please+review+it%3F"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex w-fit items-center justify-center gap-2 rounded-full border-2 border-green-950 px-6 py-3 font-medium text-green-950 transition-colors hover:bg-green-950 hover:text-green-100"
                        >
                            Create a GitHub Issue
                        </a>
                    )}

                    <a
                        href="/"
                        className="inline-flex w-fit items-center justify-center gap-2 rounded-full bg-green-950 px-6 py-3 font-medium text-green-100 transition-colors hover:bg-green-800"
                    >
                        Go Home
                    </a>
                </div>

                <div className="mt-8 text-sm font-medium text-green-950/55">
                    pollinations.ai
                </div>
            </div>
        </div>
    );
}
