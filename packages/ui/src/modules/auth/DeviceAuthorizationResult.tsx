import { cn } from "../../lib/cn.ts";
import { CheckIcon, LockIcon } from "../../primitives/icons/index.tsx";
import { Heading, Text } from "../../primitives/Typography.tsx";
import { AuthModal, AuthModalHeader } from "./AuthModal.tsx";

export function DeviceAuthorizationResult({
    denied = false,
}: {
    denied?: boolean;
}) {
    return (
        <AuthModal
            dialog={{ labelledBy: "device-result-title" }}
            contentClassName="polli:flex polli:flex-col"
        >
            <AuthModalHeader logoOnly />
            <div className="polli:flex polli:flex-1 polli:flex-col polli:items-center polli:justify-center polli:px-6 polli:py-16 polli:text-center">
                <span
                    aria-hidden="true"
                    className={cn(
                        "polli:mb-5 polli:flex polli:h-12 polli:w-12 polli:items-center polli:justify-center polli:rounded-full",
                        denied
                            ? "polli:bg-ink-100/80 polli:text-theme-text-muted"
                            : "polli:bg-intent-success-bg-bright/15 polli:text-intent-success-text",
                    )}
                >
                    {denied ? (
                        <LockIcon className="polli:h-6 polli:w-6" />
                    ) : (
                        <CheckIcon className="polli:h-6 polli:w-6" />
                    )}
                </span>
                <Heading as="h1" size="section" id="device-result-title">
                    {denied ? "Connection declined" : "Device connected"}
                </Heading>
                <Text size="sm" className="polli:mt-3">
                    {denied
                        ? "Your device wasn’t given access."
                        : "Return to your device to continue."}
                </Text>
                <Text size="sm" tone="muted" className="polli:mt-1">
                    You can close this tab.
                </Text>
            </div>
        </AuthModal>
    );
}
