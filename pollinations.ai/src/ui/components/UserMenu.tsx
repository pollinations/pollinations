import { useEffect, useRef, useState } from "react";
import { AUTH_COPY } from "../../copy/content/auth";
import { LINKS } from "../../copy/content/socialLinks";
import { useAuth } from "../../hooks/useAuth";
import { usePageCopy } from "../../hooks/usePageCopy";
import { Button } from "./ui/button";

const TIER_EMOJI: Record<string, string> = {
    seed: "🌱",
    flower: "🌸",
    nectar: "🍯",
};

export function UserMenu() {
    const { apiKey, isLoggedIn, profile, balance, login, logout } = useAuth();
    const { copy } = usePageCopy(AUTH_COPY);
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // Close dropdown on outside click
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: MouseEvent) => {
            if (
                menuRef.current &&
                !menuRef.current.contains(e.target as Node)
            ) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [isOpen]);

    if (!isLoggedIn) {
        return (
            <Button
                variant="primary"
                size={null}
                onClick={login}
                className="self-start px-3 py-1.5 lg:px-5 lg:py-1.5 text-xs bg-secondary-strong text-dark hover:bg-secondary-strong/80 hover:text-dark"
            >
                {copy.loginButton}
            </Button>
        );
    }

    const tierEmoji = profile?.tier ? TIER_EMOJI[profile.tier] : null;
    const displayName = profile?.githubUsername
        ? profile.githubUsername
        : profile?.name || copy.defaultUsername;

    return (
        <div ref={menuRef} className="relative">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-4 px-3 py-1.5 font-headline text-xs font-black tracking-wider text-dark bg-secondary-strong border-r-4 border-b-4 border-dark rounded-button transition hover:bg-secondary-strong/80 hover:text-dark hover:shadow-dark-md whitespace-nowrap"
            >
                {profile?.image && (
                    <img
                        src={profile.image}
                        alt=""
                        className="w-5 h-5 rounded-full"
                    />
                )}
                <span className="max-w-[140px] truncate">{displayName}</span>
                {balance !== null && (
                    <span className="text-accent-strong">
                        {balance.balance.toFixed(1)} {copy.pollenUnit}
                    </span>
                )}
            </button>

            {isOpen && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-secondary-strong/20 backdrop-blur-md border-r-4 border-b-4 border-dark rounded-button p-4 z-50 shadow-dark-lg">
                    {/* Profile */}
                    {profile && (
                        <div className="mb-3">
                            <span className="text-xs uppercase tracking-wider text-subtle font-medium block mb-1">
                                {copy.accountLabel}
                            </span>
                            <div className="flex items-center gap-1.5">
                                {profile.image && (
                                    <img
                                        src={profile.image}
                                        alt=""
                                        className="w-5 h-5 rounded-full shrink-0"
                                    />
                                )}
                                <span className="font-headline text-xs font-black text-dark">
                                    {displayName}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Balance */}
                    {balance !== null && (
                        <div className="mb-3">
                            <span className="text-xs uppercase tracking-wider text-subtle font-medium block">
                                {copy.balanceLabel}
                            </span>
                            <span className="font-headline text-xs font-black text-dark">
                                {balance.balance.toFixed(2)} {copy.pollenUnit}
                            </span>
                        </div>
                    )}

                    {/* Tier (creator tiers only) */}
                    {tierEmoji && profile?.tier && (
                        <div className="mb-3">
                            <span className="text-xs uppercase tracking-wider text-subtle font-medium block">
                                {copy.tierLabel}
                            </span>
                            <span className="font-headline text-xs font-black text-dark">
                                {tierEmoji}{" "}
                                {profile.tier.charAt(0).toUpperCase() +
                                    profile.tier.slice(1)}
                            </span>
                        </div>
                    )}

                    {/* API Key */}
                    <div className="mb-4">
                        <span className="text-xs uppercase tracking-wider text-subtle font-medium block">
                            {copy.apiKeyLabel}
                        </span>
                        <span className="font-mono text-base text-muted">
                            {apiKey.slice(0, 4)}••••••••
                        </span>
                    </div>

                    {/* BYOP CTA */}
                    <a
                        href={LINKS.byopDocs}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block mb-4 p-2 rounded-md bg-[rgb(var(--cream))] hover:opacity-80 transition-opacity"
                    >
                        <span className="text-xs uppercase tracking-wider text-dark font-bold block">
                            🔌 {copy.byopTitle}
                        </span>
                        <span className="text-xs text-muted block mt-0.5">
                            {copy.byopDescription}
                        </span>
                        <span className="text-xs text-dark font-medium mt-1 block">
                            {copy.byopLink} →
                        </span>
                    </a>

                    {/* Enter Dashboard */}
                    <Button
                        as="a"
                        href={LINKS.enter}
                        target="_blank"
                        rel="noopener noreferrer"
                        variant="primary"
                        size="sm"
                        className="w-full mb-2 bg-[rgb(var(--primary-strong))] text-dark hover:bg-[rgb(var(--primary-strong)/0.8)] hover:text-dark"
                    >
                        {copy.enterLink}
                    </Button>

                    {/* Logout */}
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                            logout();
                            setIsOpen(false);
                        }}
                        className="w-full"
                    >
                        {copy.logoutButton}
                    </Button>
                </div>
            )}
        </div>
    );
}
