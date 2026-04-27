import { createFileRoute, redirect } from "@tanstack/react-router";
import { authClient } from "../auth.ts";
import { ErrorBanner } from "../components/auth/auth-modal.tsx";
import { SocialSignInButtons } from "../components/auth/social-sign-in-buttons.tsx";
import { Button } from "../components/button.tsx";
import { FAQ } from "../components/faq.tsx";
import { Footer } from "../components/layout/footer.tsx";
import { Header } from "../components/layout/header.tsx";
import { NewsBanner } from "../components/layout/news-banner.tsx";
import { Pricing } from "../components/pricing";
import { useSocialSignIn } from "../hooks/use-social-sign-in.ts";

export const Route = createFileRoute("/sign-in")({
    component: RouteComponent,
    beforeLoad: async () => {
        const result = await authClient.getSession();
        if (result.data?.user) {
            // Check for pending redirect URL from authorize flow
            const pendingRedirectUrl =
                typeof window !== "undefined"
                    ? localStorage.getItem("pending_redirect_url")
                    : null;

            if (pendingRedirectUrl) {
                // Clear the stored URL and redirect to authorize
                localStorage.removeItem("pending_redirect_url");
                throw redirect({
                    to: "/authorize",
                    search: {
                        redirect_url: pendingRedirectUrl,
                        models: null,
                        budget: null,
                        expiry: null,
                        scope: null,
                    },
                });
            }
            throw redirect({ to: "/" });
        }
    },
});

function RouteComponent() {
    const { pendingProvider, error, signIn } = useSocialSignIn();

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-20">
                <Header>
                    <div className="flex flex-col items-center gap-2">
                        {error && <ErrorBanner>{error}</ErrorBanner>}
                        <SocialSignInButtons
                            pendingProvider={pendingProvider}
                            onSignIn={signIn}
                            color="amber"
                            className="flex flex-wrap justify-center gap-2"
                        />
                        <a
                            href="https://github.com/pollinations/pollinations/issues/5543"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-gray-500 hover:text-gray-700 underline whitespace-nowrap"
                        >
                            more options?
                        </a>
                    </div>
                    <Button
                        as="a"
                        href="/api/docs"
                        className="bg-gray-900 text-white hover:brightness-90! whitespace-nowrap"
                    >
                        API Ref.
                    </Button>
                </Header>
                <NewsBanner />
                <FAQ />
                <Pricing />
                <Footer />
            </div>
        </div>
    );
}
