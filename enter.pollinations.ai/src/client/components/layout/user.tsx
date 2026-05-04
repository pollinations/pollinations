import { Menu } from "@ark-ui/react/menu";
import type { FC, ReactNode } from "react";
import { useState } from "react";
import { cn } from "@/util.ts";

type UserProps = {
    displayName: string;
    avatarUrl?: string;
    discordLinked?: boolean;
    isLinkingDiscord?: boolean;
    onLinkDiscord?: () => void;
    onSignOut?: () => void;
    className?: string;
    menuItems?: ReactNode;
};

export const User: FC<UserProps> = ({
    displayName,
    avatarUrl,
    discordLinked,
    isLinkingDiscord,
    onLinkDiscord,
    onSignOut,
    className,
    menuItems,
}) => {
    const hasDiscordLinkItem =
        onLinkDiscord || discordLinked || isLinkingDiscord;
    const canLinkDiscord =
        Boolean(onLinkDiscord) && !discordLinked && !isLinkingDiscord;
    const [isOpen, setIsOpen] = useState(false);

    return (
        <Menu.Root open={isOpen} onOpenChange={({ open }) => setIsOpen(open)}>
            <Menu.Trigger asChild>
                <button
                    type="button"
                    className={cn(
                        "flex min-w-0 flex-row gap-2 p-1 pr-3 bg-amber-200 rounded-full items-center self-center hover:bg-amber-300 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-300 whitespace-nowrap",
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
                <Menu.Content className="bg-amber-200 rounded-lg min-w-0 w-[var(--reference-width)] z-50 focus:outline-none focus:ring-2 focus:ring-amber-300 p-1">
                    {hasDiscordLinkItem && (
                        <Menu.Item
                            value="connect-discord"
                            disabled={!canLinkDiscord}
                            className={cn(
                                "px-3 py-2 text-sm text-amber-900 flex items-center rounded-md focus:outline-none focus-visible:bg-amber-300",
                                canLinkDiscord
                                    ? "hover:bg-amber-300 cursor-pointer"
                                    : "opacity-60 cursor-default",
                            )}
                            onClick={canLinkDiscord ? onLinkDiscord : undefined}
                        >
                            {discordLinked
                                ? "Discord Connected"
                                : isLinkingDiscord
                                  ? "Connecting..."
                                  : "Connect Discord"}
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
                            className="px-3 py-2 text-sm text-amber-900 hover:bg-amber-300 cursor-pointer flex items-center rounded-md focus:outline-none focus-visible:bg-amber-300"
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
