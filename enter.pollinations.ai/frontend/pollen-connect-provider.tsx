import { GitHubIcon } from "@pollinations/ui";
import type { ReactNode } from "react";
import "./pollen-connect-provider.css";

export function ProviderScreen({
    provider,
    children,
}: {
    provider: "github" | "stripe";
    children: ReactNode;
}) {
    return (
        <div className={`connect-provider-screen connect-provider-${provider}`}>
            <header className="connect-provider-brand">
                {provider === "github" ? (
                    <>
                        <GitHubIcon width={44} height={44} />
                        <span>GitHub</span>
                    </>
                ) : (
                    <span className="connect-stripe-wordmark">stripe</span>
                )}
            </header>
            <div className="connect-provider-content">{children}</div>
        </div>
    );
}
