import { Button, Surface } from "@pollinations/ui";
import { ProviderScreen } from "./pollen-connect-provider";

// External provider handoffs only. No payment or OAuth requests are sent.
export function AccountProviderPreview({
    github,
    billing = false,
    onContinue,
}: {
    github: boolean;
    billing?: boolean;
    onContinue?: () => void;
}) {
    const params = new URLSearchParams(location.search);
    const dashboard = params.get("dashboard_preview") === "1";
    function go(canceled = false) {
        const next = new URLSearchParams(params);
        next.set(
            "screen",
            github
                ? (params.get("resume") ??
                      (dashboard ? "dash-wallet" : "account-key"))
                : dashboard
                  ? "dash-wallet"
                  : "account-wallet",
        );
        next.set(
            "account_case",
            github || billing ? "ready" : canceled ? "canceled" : "pending",
        );
        if (billing) {
            next.set(
                "billing_case",
                ["enabled", "failed", "payment"].includes(
                    params.get("billing_case") ?? "",
                )
                    ? "enabled"
                    : "ready",
            );
            next.set("stripe_billing_return", "true");
        }
        next.set("owner_session", "signed-in");
        next.delete("action");
        location.href = `/pollen-connect-screen.html?${next}`;
    }
    return (
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
                          : "Stripe handles payment. Pollinations checks that Pollen was credited before showing success."}
                </p>
                <div className="provider-checkout-actions">
                    {!github && !billing && (
                        <Button onClick={() => go(true)} data-theme="neutral">
                            Cancel
                        </Button>
                    )}
                    <Button onClick={onContinue ?? (() => go())}>
                        {github
                            ? "Return to Pollinations"
                            : billing
                              ? "Return to wallet"
                              : "Pay"}
                    </Button>
                </div>
            </Surface>
        </ProviderScreen>
    );
}
