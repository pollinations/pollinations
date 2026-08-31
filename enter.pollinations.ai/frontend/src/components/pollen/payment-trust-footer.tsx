import { CopyButton, cn, GlobeIcon, MailIcon } from "@pollinations/ui";
import type { PropsWithChildren } from "react";
import { PaymentTrustBadge } from "./payment-trust-badge.tsx";

export function PaymentTrustFooter({
    children,
    className,
}: PropsWithChildren<{ className?: string }>) {
    return (
        <div
            className={cn(
                "mt-4 space-y-2 border-t border-divider pt-4 text-[13px] leading-snug text-theme-text-muted",
                className,
            )}
        >
            <PaymentTrustBadge className="mt-0 pt-0" />
            {children}
            <p className="flex items-start gap-1.5">
                <GlobeIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                    Prices exclude tax — VAT or sales tax is added at checkout.
                </span>
            </p>
            <p className="flex items-start gap-1.5">
                <MailIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                    Payment issue or missing pollen?{" "}
                    <CopyButton
                        value="billing@pollinations.ai"
                        className="underline decoration-theme-text-soft/30 underline-offset-2 transition-colors hover:text-theme-text-soft"
                    >
                        {(copied) =>
                            copied ? "Copied!" : "billing@pollinations.ai"
                        }
                    </CopyButton>{" "}
                    — we reply same day.
                </span>
            </p>
        </div>
    );
}
