import type { ReactNode } from "react";
import { Heading, Text } from "../../primitives/Typography.tsx";
import { AuthFlowLayout } from "./AuthModal.tsx";

export function DeviceAuthorizationResult({
    denied = false,
    account,
}: {
    denied?: boolean;
    account?: ReactNode;
}) {
    return (
        <AuthFlowLayout
            dialog={{ labelledBy: "device-result-title" }}
            account={account}
            actions={null}
        >
            <div className="polli:space-y-2 polli:pt-3">
                <Heading as="h1" size="section" id="device-result-title">
                    {denied ? "Connection declined" : "Access approved"}
                </Heading>
                <p className="polli:font-body polli:text-xs polli:font-semibold polli:tracking-wide polli:text-theme-text-soft">
                    {denied
                        ? "Your device wasn’t given access."
                        : "Return to your device to continue."}
                </p>
            </div>
            <Text size="sm" tone="muted">
                You can close this tab.
            </Text>
        </AuthFlowLayout>
    );
}
