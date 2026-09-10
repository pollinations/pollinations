import { useState } from "react";
import { AccountMenu } from "../../compositions/AccountMenu.tsx";
import { Alert } from "../../compositions/Alert.tsx";
import { DropdownItem } from "../../primitives/DropdownItem.tsx";
import {
    AppIcon,
    ExternalLinkIcon,
    SignOutIcon,
} from "../../primitives/icons/index.tsx";

export function DashboardAccountMenu({
    user,
    onSignOut,
    className,
    side,
}: {
    user: {
        email: string;
        name?: string;
        preferred_username?: string;
        picture?: string | null;
    };
    onSignOut: () => void | Promise<void>;
    className?: string;
    side?: "top" | "bottom";
}) {
    const [error, setError] = useState<string | null>(null);
    return (
        <>
            {error && <Alert>{error}</Alert>}
            <AccountMenu
                name={user.preferred_username || user.name || user.email}
                avatarUrl={user.picture}
                className={className}
                side={side}
                menuClassName="polli:w-max polli:min-w-0"
            >
                {(close) => (
                    <>
                        <DropdownItem
                            as="a"
                            href="https://enter.pollinations.ai/"
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={close}
                        >
                            <AppIcon className="polli:h-4 polli:w-4 polli:shrink-0" />
                            Dashboard
                            <ExternalLinkIcon className="polli:ml-auto polli:h-3.5 polli:w-3.5 polli:shrink-0" />
                        </DropdownItem>
                        <div className="polli:my-1 polli:border-t polli:border-divider" />
                        <DropdownItem
                            onClick={() => {
                                setError(null);
                                Promise.resolve()
                                    .then(onSignOut)
                                    .catch(() =>
                                        setError(
                                            "Could not sign out. Please try again.",
                                        ),
                                    );
                            }}
                        >
                            <SignOutIcon
                                aria-hidden="true"
                                className="polli:h-4 polli:w-4 polli:shrink-0"
                            />
                            Sign out
                        </DropdownItem>
                    </>
                )}
            </AccountMenu>
        </>
    );
}
