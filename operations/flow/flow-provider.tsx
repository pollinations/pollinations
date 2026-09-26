import { Button, GitHubIcon, Surface } from "@pollinations/ui";
import type { ReactNode } from "react";
import "./flow-provider.css";

export function ProviderScreen({
    provider,
    children,
}: {
    provider: "github" | "stripe";
    children: ReactNode;
}) {
    return (
        <div className={`flow-provider-screen flow-provider-${provider}`}>
            <header className="flow-provider-brand">
                {provider === "github" ? (
                    <>
                        <GitHubIcon width={44} height={44} />
                        <span>GitHub</span>
                    </>
                ) : (
                    <span className="flow-stripe-wordmark">stripe</span>
                )}
            </header>
            <div className="flow-provider-content">{children}</div>
        </div>
    );
}

// Preserve the external handoff illustrations. They do not complete OAuth,
// create payments, or mutate the local account when inspected.
export function ProviderReference({
    github,
    billing = false,
}: {
    github: boolean;
    billing?: boolean;
}) {
    return (
        <div inert>
            <ProviderScreen provider={github ? "github" : "stripe"}>
                <Surface variant="card" className="provider-checkout-card">
                    <h1 className="text-xl font-semibold font-body">
                        {github
                            ? "Continue on GitHub"
                            : billing
                              ? "Manage billing"
                              : "Review purchase"}
                    </h1>
                    <p>
                        {github
                            ? "Complete sign-in on GitHub, then return to the page you opened."
                            : billing
                              ? "Update your payment method on Stripe, then return to your wallet."
                              : "Stripe handles payment and notifies Pollinations after confirmation. This is an external reference, not a live checkout."}
                    </p>
                    <div className="provider-checkout-actions">
                        {!github && !billing && (
                            <Button data-theme="neutral">Cancel</Button>
                        )}
                        <Button>
                            {github
                                ? "Return to Pollinations"
                                : billing
                                  ? "Return to wallet"
                                  : "Pay"}
                        </Button>
                    </div>
                </Surface>
            </ProviderScreen>
        </div>
    );
}
