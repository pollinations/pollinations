import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/error")({
    component: ErrorPage,
    validateSearch: (search: Record<string, unknown>) => ({
        error: (search.error as string) || "",
        error_description: (search.error_description as string) || "",
    }),
});

function ErrorPage() {
    const { error } = Route.useSearch();
    const isBanned = error === "banned";

    return (
        <div className="min-h-screen flex items-center justify-center px-4">
            <div className="max-w-md w-full bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg p-8 text-center">
                <div className="text-5xl mb-4">{isBanned ? "🐝" : "🌸"}</div>

                <h1 className="font-heading text-3xl mb-3">
                    {isBanned ? "Account Deactivated" : "Something went wrong"}
                </h1>

                <p className="font-body text-green-800 mb-6 leading-relaxed">
                    {isBanned
                        ? "Your account has been deactivated. This might be a mistake — reach out and we'll sort it out together."
                        : "An unexpected error occurred. Please try again or open a GitHub issue if this keeps happening."}
                </p>

                <div className="flex flex-col gap-3">
                    {isBanned && (
                        <a
                            href="https://github.com/pollinations/pollinations/issues/new?title=Account+deactivated&body=Hi%2C+my+account+has+been+deactivated+and+I+believe+this+may+be+a+mistake.+Could+you+please+review+it%3F"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center gap-2 rounded-full bg-green-950 text-green-100 hover:bg-green-800 px-6 py-3 font-medium transition-colors"
                        >
                            Create a GitHub Issue
                        </a>
                    )}

                    <a
                        href="/"
                        className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-green-950 text-green-950 hover:bg-green-950 hover:text-green-100 px-6 py-3 font-medium transition-colors mt-2"
                    >
                        Go to Home →
                    </a>
                </div>

                <div className="mt-8 text-sm text-green-600">
                    🌸 pollinations.ai 🌸
                </div>
            </div>
        </div>
    );
}
