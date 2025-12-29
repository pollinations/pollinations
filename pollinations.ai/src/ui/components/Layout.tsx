import { useCallback, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { SOCIAL_LINKS } from "../../copy/content/socialLinks";
import { ExternalLinkIcon } from "../assets/ExternalLinkIcon";
import { useTheme } from "../contexts/ThemeContext";
import { BackgroundRenderer } from "./BackgroundRenderer";
import { BetaBanner } from "./BetaBanner";
import { Logo } from "./Logo";
import { AIPromptInput } from "./theme/AIPromptInput";
import { Button } from "./ui/button";

const tabs = [
    { path: "/", label: "Hello" },
    { path: "/play", label: "Play" },
    { path: "/docs", label: "Docs" },
    { path: "/apps", label: "Apps" },
    { path: "/community", label: "Community" },
];

import { useFooterVisibility } from "../../hooks/useFooterVisibility";
import { useHeaderVisibility } from "../../hooks/useHeaderVisibility";

function Layout() {
    const showFooter = useFooterVisibility();
    const showHeader = useHeaderVisibility();
    const [emailCopied, setEmailCopied] = useState(false);
    const [isPromptOpen, setIsPromptOpen] = useState(false);
    const [isBannerVisible, setIsBannerVisible] = useState(false);
    const { backgroundHtml } = useTheme();

    const handleBannerVisibilityChange = useCallback((visible: boolean) => {
        setIsBannerVisible(visible);
    }, []);

    const handleLogoClick = () => {
        setIsPromptOpen(!isPromptOpen);
    };

    return (
        <div
            className={`relative min-h-screen ${
                backgroundHtml ? "bg-transparent" : "bg-surface-base"
            }`}
        >
            <BetaBanner onVisibilityChange={handleBannerVisibilityChange} />
            <BackgroundRenderer />
            {/* Fixed Header */}
            <header
                className={`fixed left-0 right-0 z-50 transition-all duration-300 flex flex-col ${
                    showHeader ? "translate-y-0" : "-translate-y-full"
                }`}
                style={{ top: isBannerVisible ? "44px" : "0" }}
            >
                <div className="w-full px-4 py-3 pb-5 md:py-4 md:pb-5">
                    <div className="max-w-4xl mx-auto pl-2 md:pl-8 relative overflow-visible">
                        {/* Mobile: Logo left, Two rows of buttons right */}
                        <div className="md:hidden flex items-center gap-3 overflow-visible">
                            {/* Logo - Left side */}
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={handleLogoClick}
                                    className="flex-shrink-0 focus:outline-none transition-transform active:scale-95"
                                >
                                    <Logo className="w-24 h-24 object-contain" />
                                </button>
                            </div>

                            {/* Navigation Tabs - Two rows right-aligned */}
                            <div className="flex flex-col gap-2 flex-1 pb-2 overflow-visible">
                                {/* Row 1: Hello, Play, Docs */}
                                <div className="flex gap-2 justify-end overflow-visible">
                                    {tabs.slice(0, 3).map((tab) => (
                                        <NavLink
                                            key={tab.path}
                                            to={tab.path}
                                            end={tab.path === "/"}
                                            className="no-underline"
                                        >
                                            {({ isActive }) => (
                                                <Button
                                                    variant="nav"
                                                    size={null}
                                                    data-active={isActive}
                                                    className="min-w-[60px]"
                                                >
                                                    {tab.label}
                                                </Button>
                                            )}
                                        </NavLink>
                                    ))}
                                </div>
                                {/* Row 2: Apps, Community */}
                                <div className="flex gap-2 justify-end overflow-visible pb-1">
                                    {tabs.slice(3, 5).map((tab) => (
                                        <NavLink
                                            key={tab.path}
                                            to={tab.path}
                                            end={tab.path === "/"}
                                            className="no-underline"
                                        >
                                            {({ isActive }) => (
                                                <Button
                                                    variant="nav"
                                                    size={null}
                                                    data-active={isActive}
                                                    className="min-w-[60px]"
                                                >
                                                    {tab.label}
                                                </Button>
                                            )}
                                        </NavLink>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Desktop: Logo left, Buttons right */}
                        <div className="hidden md:block overflow-visible">
                            <div className="flex items-center justify-between gap-4 overflow-visible pb-1">
                                {/* Logo - Left side */}
                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={handleLogoClick}
                                        className="flex-shrink-0 focus:outline-none transition-transform active:scale-95"
                                    >
                                        <Logo className="w-20 h-20 object-contain" />
                                    </button>
                                </div>

                                {/* Navigation Tabs + Social Links - Right side */}
                                <div className="flex flex-col items-start">
                                    <div className="flex gap-3 items-center overflow-x-auto overflow-y-visible scrollbar-hide pb-1">
                                        {/* Navigation Tabs */}
                                        {tabs.map((tab) => (
                                            <NavLink
                                                key={tab.path}
                                                to={tab.path}
                                                end={tab.path === "/"}
                                                className="no-underline"
                                            >
                                                {({ isActive }) => (
                                                    <Button
                                                        variant="nav"
                                                        size={null}
                                                        data-active={isActive}
                                                    >
                                                        {tab.label}
                                                    </Button>
                                                )}
                                            </NavLink>
                                        ))}

                                        {/* Social Media Links + Enter Button */}
                                        <div className="flex gap-2 items-center">
                                            {Object.entries(SOCIAL_LINKS)
                                                .filter(
                                                    ([key]) =>
                                                        key === "discord" ||
                                                        key === "github"
                                                )
                                                .map(
                                                    ([
                                                        key,
                                                        {
                                                            url,
                                                            icon: Icon,
                                                            label,
                                                        },
                                                    ]) => (
                                                        <Button
                                                            key={key}
                                                            as="a"
                                                            href={url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            title={label}
                                                            variant="icon"
                                                            size={null}
                                                            className="text-text-body-main"
                                                        >
                                                            <Icon className="w-full h-full" />
                                                        </Button>
                                                    )
                                                )}

                                            {/* Enter + Language Toggle Stack */}
                                            <div className="flex flex-col items-end gap-0.5">
                                                {/* Enter Button */}
                                                <Button
                                                    as="a"
                                                    href="https://enter.pollinations.ai"
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    variant="iconText"
                                                    size={null}
                                                >
                                                    <span className="font-headline text-xs font-black uppercase tracking-wider text-text-brand">
                                                        Enter
                                                    </span>
                                                    <ExternalLinkIcon className="w-4 h-4 text-text-brand" />
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Full Width AI Prompt Input */}
                <AIPromptInput isOpen={isPromptOpen} />
            </header>

            {/* Main Content - Full Bleed */}
            <main
                className="w-full min-h-screen pb-40 md:pb-24 transition-all duration-200 pt-[calc(8rem+var(--banner-offset))] md:pt-[calc(7rem+var(--banner-offset))]"
                style={
                    {
                        "--banner-offset":
                            isBannerVisible && isPromptOpen
                                ? "calc(44px + 4rem)"
                                : isBannerVisible
                                ? "44px"
                                : isPromptOpen
                                ? "4rem"
                                : "0px",
                    } as React.CSSProperties
                }
            >
                <Outlet />
            </main>

            {/* Floating Glassy Footer */}
            <footer
                className={`fixed bottom-0 left-0 right-0 z-40 transition-transform duration-300 ${
                    showFooter ? "translate-y-0" : "translate-y-full"
                }`}
            >
                {/* Mobile: Simplified footer */}
                <div className="md:hidden">
                    <div className="w-full px-4 py-3">
                        <div className="max-w-4xl mx-auto flex flex-col gap-3">
                            {/* 1. Social Icons */}
                            <div className="flex items-center justify-center">
                                <div className="flex items-center">
                                    <Button
                                        as="a"
                                        href={SOCIAL_LINKS.github.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title={SOCIAL_LINKS.github.label}
                                        variant="icon"
                                        size={null}
                                        className="w-10 h-10 text-text-body-main"
                                    >
                                        <SOCIAL_LINKS.github.icon className="w-full h-full" />
                                    </Button>
                                    <Button
                                        as="a"
                                        href={SOCIAL_LINKS.discord.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title={SOCIAL_LINKS.discord.label}
                                        variant="icon"
                                        size={null}
                                        className="w-10 h-10 text-text-body-main"
                                    >
                                        <SOCIAL_LINKS.discord.icon className="w-full h-full" />
                                    </Button>
                                    {/* All Other Social Icons */}
                                    {Object.entries(SOCIAL_LINKS)
                                        .filter(
                                            ([key]) =>
                                                key !== "github" &&
                                                key !== "discord"
                                        )
                                        .map(
                                            ([
                                                key,
                                                { url, icon: Icon, label },
                                            ]) => (
                                                <Button
                                                    key={key}
                                                    as="a"
                                                    href={url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    title={label}
                                                    variant="icon"
                                                    size={null}
                                                    className="w-10 h-10 text-text-body-main"
                                                >
                                                    <Icon className="w-full h-full" />
                                                </Button>
                                            )
                                        )}
                                </div>
                            </div>

                            {/* 2. Terms, Privacy, Email, Enter */}
                            <div className="flex items-center justify-center">
                                <Button
                                    as="a"
                                    href="/terms"
                                    variant="iconText"
                                    size={null}
                                    className="h-10"
                                >
                                    <span className="font-headline text-xs font-black uppercase tracking-wider text-text-body-main">
                                        Terms
                                    </span>
                                </Button>
                                <Button
                                    as="a"
                                    href="/privacy"
                                    variant="iconText"
                                    size={null}
                                    className="h-10"
                                >
                                    <span className="font-headline text-xs font-black uppercase tracking-wider text-text-body-main">
                                        Privacy
                                    </span>
                                </Button>
                                <Button
                                    type="button"
                                    onClick={() => {
                                        navigator.clipboard.writeText(
                                            "hello@pollinations.ai"
                                        );
                                        setEmailCopied(true);
                                        setTimeout(
                                            () => setEmailCopied(false),
                                            2000
                                        );
                                    }}
                                    variant="iconText"
                                    size={null}
                                    className="h-10"
                                >
                                    <span className="font-headline text-xs font-black uppercase tracking-wider text-text-body-main">
                                        Email
                                    </span>
                                    {emailCopied && (
                                        <span className="absolute -top-8 left-0 font-headline text-xs font-black text-text-brand uppercase tracking-wider">
                                            Copied!
                                        </span>
                                    )}
                                </Button>
                                <Button
                                    as="a"
                                    href="https://enter.pollinations.ai"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    variant="iconText"
                                    size={null}
                                    className="h-10"
                                >
                                    <span className="font-headline text-xs font-black uppercase tracking-wider text-text-brand">
                                        Enter
                                    </span>
                                    <ExternalLinkIcon className="w-3 h-3 text-text-brand" />
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Desktop: Single line with mobile styling */}
                <div className="hidden md:block w-full px-4 py-3">
                    <div className="max-w-4xl mx-auto">
                        <div className="flex items-center justify-between gap-6">
                            {/* Left: Branding Text */}
                            <div className="text-left flex-shrink-0">
                                <p className="font-headline text-xs font-black text-text-body-main uppercase tracking-wider">
                                    Pollinations.AI - 2025
                                </p>
                                <p className="font-body text-[10px] text-text-body-main">
                                    Open source AI innovation from Berlin
                                </p>
                            </div>

                            {/* Center: Links as Buttons */}
                            <div className="flex items-center flex-shrink-0">
                                <Button
                                    as="a"
                                    href="/terms"
                                    variant="iconText"
                                    size={null}
                                    className="h-10"
                                >
                                    <span className="font-headline text-xs font-black uppercase tracking-wider text-text-body-main">
                                        Terms
                                    </span>
                                </Button>
                                <Button
                                    as="a"
                                    href="/privacy"
                                    variant="iconText"
                                    size={null}
                                    className="h-10"
                                >
                                    <span className="font-headline text-xs font-black uppercase tracking-wider text-text-body-main">
                                        Privacy
                                    </span>
                                </Button>
                                <Button
                                    type="button"
                                    onClick={() => {
                                        navigator.clipboard.writeText(
                                            "hello@pollinations.ai"
                                        );
                                        setEmailCopied(true);
                                        setTimeout(
                                            () => setEmailCopied(false),
                                            2000
                                        );
                                    }}
                                    variant="iconText"
                                    size={null}
                                    className="h-10"
                                >
                                    <span className="font-headline text-xs font-black uppercase tracking-wider text-text-body-main">
                                        Email
                                    </span>
                                    {emailCopied && (
                                        <span className="absolute -top-8 left-0 font-headline text-xs font-black text-text-brand uppercase tracking-wider">
                                            Copied!
                                        </span>
                                    )}
                                </Button>
                            </div>

                            {/* Right: Social Buttons */}
                            <div className="flex items-center gap-3">
                                <div className="flex items-center">
                                    {/* GitHub */}
                                    <Button
                                        as="a"
                                        href={SOCIAL_LINKS.github.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title={SOCIAL_LINKS.github.label}
                                        variant="icon"
                                        size={null}
                                        className="w-10 h-10 text-text-body-main"
                                    >
                                        <SOCIAL_LINKS.github.icon className="w-full h-full" />
                                    </Button>
                                    {/* Discord */}
                                    <Button
                                        as="a"
                                        href={SOCIAL_LINKS.discord.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title={SOCIAL_LINKS.discord.label}
                                        variant="icon"
                                        size={null}
                                        className="w-10 h-10 text-text-body-main"
                                    >
                                        <SOCIAL_LINKS.discord.icon className="w-full h-full" />
                                    </Button>
                                    {/* All Other Social Icons */}
                                    {Object.entries(SOCIAL_LINKS)
                                        .filter(
                                            ([key]) =>
                                                key !== "github" &&
                                                key !== "discord"
                                        )
                                        .map(
                                            ([
                                                key,
                                                { url, icon: Icon, label },
                                            ]) => (
                                                <Button
                                                    key={key}
                                                    as="a"
                                                    href={url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    title={label}
                                                    variant="icon"
                                                    size={null}
                                                    className="w-10 h-10 text-text-body-main"
                                                >
                                                    <Icon className="w-full h-full" />
                                                </Button>
                                            )
                                        )}
                                </div>
                                {/* Enter Button */}
                                <Button
                                    as="a"
                                    href="https://enter.pollinations.ai"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    variant="iconText"
                                    size={null}
                                    className="h-10"
                                >
                                    <span className="font-headline text-xs font-black uppercase tracking-wider text-text-brand">
                                        Enter
                                    </span>
                                    <ExternalLinkIcon className="w-4 h-4 text-text-brand" />
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
}

export default Layout;
