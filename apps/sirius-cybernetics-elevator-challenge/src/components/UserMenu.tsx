import { useEffect, useRef, useState } from "react";
import type { UserBalance, UserProfile } from "@/hooks/ui";

const TIER_EMOJI: Record<string, string> = {
    seed: "\u{1F331}",
    flower: "\u{1F338}",
    nectar: "\u{1F36F}",
};

interface UserMenuProps {
    profile: UserProfile | null;
    balance: UserBalance | null;
    apiKey: string;
    logout: () => void;
}

export function UserMenu({ profile, balance, apiKey, logout }: UserMenuProps) {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // Close on outside click
    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (
                menuRef.current &&
                !menuRef.current.contains(e.target as Node)
            ) {
                setIsOpen(false);
            }
        }
        if (isOpen) document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [isOpen]);

    const displayName = profile?.githubUsername || profile?.name || "User";
    const tierEmoji = profile?.tier ? TIER_EMOJI[profile.tier] : null;

    return (
        <div ref={menuRef} className="relative">
            {/* Toggle button */}
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-3 py-1.5 border border-green-400 bg-gray-800 hover:bg-gray-700 text-green-400 text-xs font-mono transition-colors"
            >
                {profile?.image ? (
                    <img
                        src={profile.image}
                        alt=""
                        className="w-5 h-5 rounded-full"
                    />
                ) : (
                    <span className="w-5 h-5 rounded-full bg-green-400 text-black flex items-center justify-center text-[10px] font-bold">
                        {displayName.charAt(0).toUpperCase()}
                    </span>
                )}
                <span className="max-w-[100px] truncate">{displayName}</span>
                {balance !== null && (
                    <span className="text-yellow-400">
                        {balance.balance.toFixed(1)} pollen
                    </span>
                )}
            </button>

            {/* Dropdown */}
            {isOpen && (
                <div className="absolute right-0 top-full mt-1 w-64 bg-gray-900 border border-green-400 text-green-400 font-mono text-xs z-50 shadow-lg shadow-green-400/10">
                    {/* Profile section */}
                    <div className="p-3 border-b border-green-400/30">
                        <div className="flex items-center gap-2 mb-2">
                            {profile?.image ? (
                                <img
                                    src={profile.image}
                                    alt=""
                                    className="w-8 h-8 rounded-full"
                                />
                            ) : (
                                <span className="w-8 h-8 rounded-full bg-green-400 text-black flex items-center justify-center text-sm font-bold">
                                    {displayName.charAt(0).toUpperCase()}
                                </span>
                            )}
                            <div className="min-w-0">
                                <div className="text-green-400 font-bold truncate">
                                    {displayName}
                                </div>
                                {profile?.email && (
                                    <div className="text-green-600 truncate text-[10px]">
                                        {profile.email}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Tier */}
                        {tierEmoji && profile?.tier && (
                            <div className="mb-1">
                                <span className="text-green-600 uppercase tracking-wider">
                                    Tier:{" "}
                                </span>
                                <span className="text-yellow-400 font-bold">
                                    {tierEmoji}{" "}
                                    {profile.tier.charAt(0).toUpperCase() +
                                        profile.tier.slice(1)}
                                </span>
                            </div>
                        )}

                        {/* Balance */}
                        {balance !== null && (
                            <div className="mb-1">
                                <span className="text-green-600 uppercase tracking-wider">
                                    Balance:{" "}
                                </span>
                                <span className="text-yellow-400 font-bold">
                                    {balance.balance.toFixed(2)} pollen
                                </span>
                            </div>
                        )}

                        {/* API Key (masked) */}
                        <div>
                            <span className="text-green-600 uppercase tracking-wider">
                                API Key:{" "}
                            </span>
                            <span className="text-green-400/60">
                                {apiKey.slice(0, 6)}
                                {"........"}
                            </span>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="p-2 space-y-1">
                        <a
                            href="https://enter.pollinations.ai"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block w-full px-3 py-2 text-left bg-yellow-400/10 text-yellow-400 hover:bg-yellow-400/20 border border-yellow-400/30 transition-colors"
                        >
                            Buy Pollen &rarr;
                        </a>
                        <button
                            type="button"
                            onClick={() => {
                                logout();
                                setIsOpen(false);
                            }}
                            className="block w-full px-3 py-2 text-left bg-red-400/10 text-red-400 hover:bg-red-400/20 border border-red-400/30 transition-colors"
                        >
                            Logout
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
