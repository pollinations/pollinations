import { Menu } from "@ark-ui/react/menu";
import type { FC, ReactNode } from "react";
import { useState } from "react";
import { cn } from "@/util.ts";

type UserProps = {
    githubUsername: string;
    githubAvatarUrl: string;
    onSignOut?: () => void;
    className?: string;
    menuItems?: ReactNode;
};

export const User: FC<UserProps> = ({
    githubUsername,
    githubAvatarUrl,
    onSignOut,
    className,
    menuItems,
}) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <Menu.Root open={isOpen} onOpenChange={({ open }) => setIsOpen(open)}>
            <Menu.Trigger asChild>
                <button
                    type="button"
                    className={cn(
                        "flex min-w-0 flex-row gap-2 p-1 pr-3 bg-amber-200 rounded-full items-center self-center hover:bg-amber-300 transition-colors cursor-pointer whitespace-nowrap",
                        className,
                    )}
                >
                    <img
                        src={githubAvatarUrl}
                        alt={`${githubUsername} avatar`}
                        className="h-8 shrink-0 rounded-full"
                    />
                    <span className="min-w-0 flex-1 truncate text-left font-medium text-amber-900">
                        {githubUsername}
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
                    {menuItems}
                    {menuItems && (
                        <div className="my-1 border-t border-amber-300" />
                    )}
                    <Menu.Item
                        value="sign-out"
                        className="px-3 py-2 text-sm text-amber-900 hover:bg-amber-300 cursor-pointer flex items-center rounded-lg focus:outline-none focus-visible:bg-amber-300"
                        onClick={onSignOut}
                    >
                        Sign Out
                    </Menu.Item>
                </Menu.Content>
            </Menu.Positioner>
        </Menu.Root>
    );
};
