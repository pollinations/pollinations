import { Menu } from "@ark-ui/react/menu";
import type { FC } from "react";
import { cn } from "../../../util.ts";

type UserProps = {
    displayName: string;
    avatarUrl: string;
    discordLinked?: boolean;
    isLinkingDiscord?: boolean;
    onLinkDiscord?: () => void;
    onSignOut?: () => void;
};

export const User: FC<UserProps> = ({
    displayName,
    avatarUrl,
    discordLinked,
    isLinkingDiscord,
    onLinkDiscord,
    onSignOut,
}) => {
    const canLinkDiscord = !discordLinked && !isLinkingDiscord;

    return (
        <Menu.Root>
            <Menu.Trigger asChild>
                <button
                    type="button"
                    className="flex flex-row gap-2 p-1 pr-3 bg-amber-200 rounded-full items-center self-center hover:bg-amber-300 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-300 whitespace-nowrap"
                >
                    {avatarUrl ? (
                        <img
                            src={avatarUrl}
                            alt={`${displayName} avatar`}
                            className="h-8 rounded-full"
                        />
                    ) : (
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-300 text-sm font-bold text-amber-900">
                            {displayName.slice(0, 1).toUpperCase()}
                        </span>
                    )}
                    <span className="font-medium text-amber-900">
                        {displayName}
                    </span>
                    <svg
                        className="w-4 h-4 text-amber-900 ml-1"
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
                <Menu.Content className="bg-amber-200 rounded-lg min-w-44 w-max z-50 focus:outline-none focus:ring-2 focus:ring-amber-300">
                    <Menu.Item
                        value="connect-discord"
                        disabled={!canLinkDiscord}
                        className={cn(
                            "px-4 py-2 text-sm text-amber-900 flex items-center",
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
                    <Menu.Item
                        value="sign-out"
                        className="px-4 py-2 text-sm text-amber-900 hover:bg-amber-300 cursor-pointer flex items-center"
                        onClick={onSignOut}
                    >
                        Sign Out
                    </Menu.Item>
                </Menu.Content>
            </Menu.Positioner>
        </Menu.Root>
    );
};
