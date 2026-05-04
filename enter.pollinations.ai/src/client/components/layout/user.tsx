import { Menu } from "@ark-ui/react/menu";
import type { FC, ReactNode } from "react";
import { useState } from "react";
import { cn } from "@/util.ts";

type UserProps = {
    displayName: string;
    avatarUrl?: string;
    discordLinked?: boolean;
    isLinkingDiscord?: boolean;
    isUnlinkingDiscord?: boolean;
    onLinkDiscord?: () => void;
    onUnlinkDiscord?: () => void;
    onSignOut?: () => void;
    className?: string;
    menuItems?: ReactNode;
};

export const User: FC<UserProps> = ({
    displayName,
    avatarUrl,
    discordLinked,
    isLinkingDiscord,
    isUnlinkingDiscord,
    onLinkDiscord,
    onUnlinkDiscord,
    onSignOut,
    className,
    menuItems,
}) => {
    const hasDiscordLinkItem =
        onLinkDiscord ||
        onUnlinkDiscord ||
        discordLinked ||
        isLinkingDiscord ||
        isUnlinkingDiscord;
    const canLinkDiscord =
        Boolean(onLinkDiscord) &&
        !discordLinked &&
        !isLinkingDiscord &&
        !isUnlinkingDiscord;
    const canUnlinkDiscord =
        Boolean(onUnlinkDiscord) &&
        Boolean(discordLinked) &&
        !isLinkingDiscord &&
        !isUnlinkingDiscord;
    const [isOpen, setIsOpen] = useState(false);

    return (
        <Menu.Root open={isOpen} onOpenChange={({ open }) => setIsOpen(open)}>
            <Menu.Trigger asChild>
                <button
                    type="button"
                    className={cn(
                        "flex min-w-0 flex-row gap-2 p-1 pr-3 bg-amber-200 rounded-full items-center self-center hover:bg-amber-300 transition-colors cursor-pointer focus:outline-none whitespace-nowrap",
                        className,
                    )}
                >
                    {avatarUrl ? (
                        <img
                            src={avatarUrl}
                            alt={`${displayName} avatar`}
                            className="h-8 w-8 shrink-0 rounded-full object-cover"
                        />
                    ) : (
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-300 text-sm font-bold text-amber-900">
                            {displayName.slice(0, 1).toUpperCase()}
                        </span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-left font-medium text-amber-900">
                        {displayName}
                    </span>
                    <svg
                        className={cn(
                            "ml-auto h-4 w-4 shrink-0 text-amber-900 transition-transform duration-200 ease-out",
                            isOpen ? "rotate-180" : "rotate-0",
                        )}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={3}
                            d="M19 9l-7 7-7-7"
                        />
                    </svg>
                </button>
            </Menu.Trigger>
            <Menu.Positioner>
                <Menu.Content className="bg-amber-200 rounded-lg min-w-0 w-[var(--reference-width)] z-50 focus:outline-none p-1">
                    {hasDiscordLinkItem && (
                        <Menu.Item
                            value={
                                discordLinked
                                    ? "disconnect-discord"
                                    : "connect-discord"
                            }
                            disabled={!canLinkDiscord && !canUnlinkDiscord}
                            className={cn(
                                "px-3 py-2 text-sm text-amber-900 flex items-center gap-2 rounded-md focus:outline-none",
                                canLinkDiscord || canUnlinkDiscord
                                    ? "font-medium hover:bg-amber-300 cursor-pointer"
                                    : "opacity-60 cursor-default",
                            )}
                            onClick={
                                canUnlinkDiscord
                                    ? onUnlinkDiscord
                                    : canLinkDiscord
                                      ? onLinkDiscord
                                      : undefined
                            }
                        >
                            <span
                                className={cn(
                                    "h-4 w-4 shrink-0",
                                    discordLinked
                                        ? "text-violet-600"
                                        : "text-amber-900/55",
                                )}
                                aria-hidden="true"
                            >
                                <DiscordIcon />
                            </span>
                            <span className="min-w-0 flex-1 truncate">
                                {discordLinked
                                    ? isUnlinkingDiscord
                                        ? "Disconnecting..."
                                        : "Disconnect Discord"
                                    : isLinkingDiscord
                                      ? "Connecting..."
                                      : "Connect Discord"}
                            </span>
                        </Menu.Item>
                    )}
                    {hasDiscordLinkItem && (menuItems || onSignOut) && (
                        <div className="my-1 border-t border-amber-300" />
                    )}
                    {menuItems}
                    {menuItems && onSignOut && (
                        <div className="my-1 border-t border-amber-300" />
                    )}
                    {onSignOut && (
                        <Menu.Item
                            value="sign-out"
                            className="px-3 py-2 text-sm text-amber-900 hover:bg-amber-300 cursor-pointer flex items-center rounded-md focus:outline-none"
                            onClick={onSignOut}
                        >
                            Sign Out
                        </Menu.Item>
                    )}
                </Menu.Content>
            </Menu.Positioner>
        </Menu.Root>
    );
};

function DiscordIcon() {
    return (
        <svg viewBox="0 0 24 24" className="h-full w-full" aria-hidden="true">
            <path
                fill="currentColor"
                d="M20.32 4.37A19.8 19.8 0 0 0 15.36 2.83a.07.07 0 0 0-.08.04c-.21.38-.45.88-.62 1.27a18.27 18.27 0 0 0-5.52 0 12.84 12.84 0 0 0-.63-1.27.08.08 0 0 0-.08-.04A19.74 19.74 0 0 0 3.47 4.37a.07.07 0 0 0-.03.03C.31 9.07-.55 13.61-.13 18.1a.08.08 0 0 0 .03.06 19.9 19.9 0 0 0 6.08 3.07.08.08 0 0 0 .09-.03c.47-.64.88-1.31 1.24-2.02a.08.08 0 0 0-.04-.1 13.08 13.08 0 0 1-1.9-.91.08.08 0 0 1-.01-.13c.13-.1.25-.2.37-.29a.07.07 0 0 1 .08-.01 14.24 14.24 0 0 0 12.38 0 .07.07 0 0 1 .08.01c.12.1.25.2.38.3a.08.08 0 0 1-.01.12 12.22 12.22 0 0 1-1.9.9.08.08 0 0 0-.04.11c.36.7.77 1.38 1.23 2.02a.08.08 0 0 0 .1.03 19.84 19.84 0 0 0 6.08-3.07.08.08 0 0 0 .03-.05c.5-5.2-.84-9.7-3.77-13.71a.06.06 0 0 0-.03-.03ZM8.02 15.37c-1.18 0-2.16-1.08-2.16-2.4 0-1.32.96-2.4 2.16-2.4 1.2 0 2.18 1.09 2.16 2.4 0 1.32-.96 2.4-2.16 2.4Zm7.96 0c-1.18 0-2.16-1.08-2.16-2.4 0-1.32.96-2.4 2.16-2.4 1.2 0 2.18 1.09 2.16 2.4 0 1.32-.95 2.4-2.16 2.4Z"
            />
        </svg>
    );
}
