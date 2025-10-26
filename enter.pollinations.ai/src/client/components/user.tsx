import { Menu } from "@ark-ui/react/menu";
import type { FC } from "react";

type UserProps = {
    githubUsername: string;
    githubAvatarUrl: string;
    onSignOut?: () => void;
    onUserPortal?: () => void;
};

export const User: FC<UserProps> = ({
    githubUsername,
    githubAvatarUrl,
    onSignOut,
    onUserPortal,
}) => {
    return (
        <Menu.Root>
            <Menu.Trigger asChild>
                <button className="flex flex-row gap-2 p-1 pr-3 bg-amber-200 rounded-full items-center self-center hover:bg-amber-300 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-300">
                    <img src={githubAvatarUrl} className="h-8 rounded-full" />
                    <span className="font-medium text-amber-900">
                        {githubUsername}
                    </span>
                    <svg
                        className="w-4 h-4 text-amber-900 ml-1"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
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
                <Menu.Content className="bg-amber-200 rounded-lg min-w-0 w-[var(--reference-width)] z-50 focus:outline-none focus:ring-2 focus:ring-amber-300">
                    <Menu.Item
                        value="user-portal"
                        className="px-4 py-2 text-sm text-amber-900 hover:bg-amber-300 cursor-pointer flex items-center border-b-1 border-amber-300"
                        onClick={onUserPortal}
                    >
                        Billing
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
