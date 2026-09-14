import { useState } from "react";
import { AccountMenu } from "../../compositions/AccountMenu.tsx";
import { Alert } from "../../compositions/Alert.tsx";
import { DropdownItem } from "../../primitives/DropdownItem.tsx";
import { SignOutIcon } from "../../primitives/icons/index.tsx";

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
            </AccountMenu>
        </>
    );
}
