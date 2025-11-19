import { NavLink, Outlet } from "react-router-dom";
import { useState } from "react";
import logo from "../logo/logo.svg";
import { Button } from "./ui/button";
import { ExternalLinkIcon } from "../icons/ExternalLinkIcon";
import { SOCIAL_LINKS } from "../config/socialLinksList";
import { Colors } from "../config/colors";

const tabs = [
    { path: "/hello", label: "Hello" },
    { path: "/play", label: "Play" },
    { path: "/docs", label: "Docs" },
    { path: "/apps", label: "Apps" },
    { path: "/community", label: "Community" },
];

import { useFooterVisibility } from "../hooks/useFooterVisibility";
import { useHeaderVisibility } from "../hooks/useHeaderVisibility";

function Layout() {
    const showFooter = useFooterVisibility();
    const showHeader = useHeaderVisibility();
    const [emailCopied, setEmailCopied] = useState(false);
    return (
        <div className="relative min-h-screen bg-offwhite/80">
            {/* Floating Transparent Header */}
            <header
                className={`fixed top-0 left-0 right-0 z-50 transition-transform duration-300 ${
                    showHeader ? "translate-y-0" : "-translate-y-full"
                }`}
            >
                <div className="w-full px-4 py-3 md:py-4">
                    <div className="max-w-4xl mx-auto">
                        {/* Mobile: Logo left, Two rows of buttons right */}
                        <div className="md:hidden flex items-center gap-3">
                            {/* Logo - Left side */}
                            <div className="flex-shrink-0 w-24 h-24">
                                <img
                                    src={logo}
                                    alt="pollinations.ai"
                                    className="w-full h-full object-contain"
                                    style={{
                                        filter: `brightness(0) drop-shadow(4px 4px 0px ${Colors.rose})`,
                                    }}
                                />
                            </div>

                            {/* Navigation Tabs - Two rows right-aligned */}
                            <div className="flex flex-col gap-2 flex-1">
                                {/* Row 1: Hello, Play, Docs */}
                                <div className="flex gap-2 justify-end">
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
                                <div className="flex gap-2 justify-end">
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
                        <div className="hidden md:block">
                            <div className="flex items-center justify-between gap-4 overflow-hidden">
                                {/* Logo - Left side */}
                                <div className="flex-shrink-0 w-20 h-20">
                                    <img
                                        src={logo}
                                        alt="pollinations.ai"
                                        className="w-full h-full object-contain"
                                        style={{
                                            filter: `brightness(0) drop-shadow(4px 4px 0px ${Colors.rose})`,
                                        }}
                                    />
                                </div>

                                {/* Navigation Tabs + Social Links - Right side */}
                                <div className="flex gap-3 items-center overflow-x-auto scrollbar-hide">
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
                                                    { url, icon, label },
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
                                                    >
                                                        <img
                                                            src={icon}
                                                            alt={label}
                                                            className="w-full h-full object-contain"
                                                        />
                                                    </Button>
                                                )
                                            )}

                                        {/* Enter Button */}
                                        <Button
                                            as="a"
                                            href="https://enter.pollinations.ai"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            variant="iconText"
                                            size={null}
                                        >
                                            <span className="font-headline text-xs font-black uppercase tracking-wider text-rose">
                                                Enter
                                            </span>
                                            <ExternalLinkIcon
                                                className="w-3 h-3"
                                                stroke={Colors.rose}
                                            />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content - Full Bleed */}
            <main className="w-full min-h-screen pt-32 md:pt-28 pb-40 md:pb-24">
                <Outlet />
            </main>

            {/* Floating Glassy Footer */}
            <footer
                className={`fixed bottom-0 left-0 right-0 z-40 transition-transform duration-300 ${
                    showFooter ? "translate-y-0" : "translate-y-full"
                }`}
            >
                {/* Mobile: Transparent footer */}
                <div className="md:hidden">
                    <div className="w-full px-4 py-3">
                        <div className="max-w-4xl mx-auto flex flex-col gap-6">
                            {/* 1. GitHub, Discord, Enter - Brutalist buttons */}
                            <div className="flex gap-3 justify-center">
                                {/* GitHub */}
                                <Button
                                    as="a"
                                    href={SOCIAL_LINKS.github.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title={SOCIAL_LINKS.github.label}
                                    variant="icon"
                                    size={null}
                                    className="w-10 h-10"
                                >
                                    <img
                                        src={SOCIAL_LINKS.github.icon}
                                        alt={SOCIAL_LINKS.github.label}
                                        className="w-full h-full object-contain"
                                    />
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
                                    className="w-10 h-10"
                                >
                                    <img
                                        src={SOCIAL_LINKS.discord.icon}
                                        alt={SOCIAL_LINKS.discord.label}
                                        className="w-full h-full object-contain"
                                    />
                                </Button>
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
                                    <span className="font-headline text-xs font-black uppercase tracking-wider text-rose">
                                        Enter
                                    </span>
                                    <ExternalLinkIcon
                                        className="w-3 h-3"
                                        stroke={Colors.rose}
                                    />
                                </Button>
                            </div>

                            {/* 2. Other Social Icons */}
                            <div className="flex gap-3 justify-center">
                                {Object.entries(SOCIAL_LINKS)
                                    .filter(
                                        ([key]) =>
                                            key !== "github" &&
                                            key !== "discord"
                                    )
                                    .map(([key, { url, icon, label }]) => (
                                        <Button
                                            key={key}
                                            as="a"
                                            href={url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            title={label}
                                            variant="icon"
                                            size={null}
                                            className="w-10 h-10"
                                        >
                                            <img
                                                src={icon}
                                                alt={label}
                                                className="w-full h-full object-contain"
                                            />
                                        </Button>
                                    ))}
                            </div>

                            {/* 3. Links */}
                            <div className="flex items-center justify-center gap-3 text-xs">
                                <a
                                    href="/terms"
                                    className="font-body text-offblack/60 hover:text-offblack transition-colors"
                                >
                                    Terms
                                </a>
                                <span className="text-offblack/30">•</span>
                                <a
                                    href="/privacy"
                                    className="font-body text-offblack/60 hover:text-offblack transition-colors"
                                >
                                    Privacy
                                </a>
                                <span className="text-offblack/30">•</span>
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
                                    variant="ghost"
                                    size={null}
                                >
                                    hello@pollinations.ai
                                    {emailCopied && (
                                        <span className="absolute -top-5 left-0 font-headline text-xs font-black text-rose uppercase tracking-wider">
                                            Copied!
                                        </span>
                                    )}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Desktop: Original discrete islands */}
                <div className="w-full px-4 py-2 md:py-4">
                    <div className="max-w-4xl mx-auto">
                        {/* Desktop: Original order */}
                        <div className="hidden md:flex md:items-end md:justify-between gap-3">
                            {/* Left: Branding Island */}
                            <div className="px-3 py-2 text-left">
                                <p className="font-headline text-xs font-black text-offblack uppercase tracking-wider">
                                    Pollinations.AI - 2025
                                </p>
                                <p className="font-body text-[10px] text-offblack/60">
                                    Open source AI innovation from Berlin
                                </p>
                            </div>

                            {/* Center: Links Island */}
                            <div className="px-3 py-2">
                                <div className="flex items-center gap-3 text-xs">
                                    <a
                                        href="/terms"
                                        className="font-body text-offblack/60 hover:text-offblack transition-colors"
                                    >
                                        Terms
                                    </a>
                                    <span className="text-offblack/30">•</span>
                                    <a
                                        href="/privacy"
                                        className="font-body text-offblack/60 hover:text-offblack transition-colors"
                                    >
                                        Privacy
                                    </a>
                                    <span className="text-offblack/30">•</span>
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
                                        variant="ghost"
                                        size={null}
                                    >
                                        hello@pollinations.ai
                                        {emailCopied && (
                                            <span className="absolute -top-5 left-0 font-headline text-xs font-black text-rose uppercase tracking-wider">
                                                Copied!
                                            </span>
                                        )}
                                    </Button>
                                </div>
                            </div>

                            {/* Right: Social Icons Island */}
                            <div className="px-2 py-2">
                                <div className="flex gap-3">
                                    {Object.entries(SOCIAL_LINKS).map(
                                        ([key, { url, icon, label }]) => (
                                            <Button
                                                key={key}
                                                as="a"
                                                href={url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                title={label}
                                                variant="footerIcon"
                                                size={null}
                                            >
                                                <img
                                                    src={icon}
                                                    alt={label}
                                                    className="w-full h-full object-contain"
                                                />
                                            </Button>
                                        )
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
}

export default Layout;
