import { Outlet, NavLink } from "react-router-dom";
import { useState, useEffect } from "react";
import logo from "../logo/logo.svg";
import { SOCIAL_LINKS } from "../config/socialLinksList";

const tabs = [
    { path: "/hello", label: "GenAI" },
    { path: "/play", label: "Play" },
    { path: "/apps", label: "Apps" },
    { path: "/docs", label: "Docs" },
    { path: "/community", label: "Community" },
];

function Layout() {
    const [showFooter, setShowFooter] = useState(false);
    const [emailCopied, setEmailCopied] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            const windowHeight = window.innerHeight;
            const documentHeight = document.documentElement.scrollHeight;
            const scrollTop = window.scrollY;
            const distanceFromBottom =
                documentHeight - (scrollTop + windowHeight);

            // Show footer when near bottom (within 100px) OR if page is short (no scroll needed)
            if (distanceFromBottom < 100 || documentHeight <= windowHeight) {
                setShowFooter(true);
            } else {
                setShowFooter(false);
            }
        };

        const handleMouseMove = (e) => {
            const windowHeight = window.innerHeight;
            const mouseY = e.clientY;
            const distanceFromBottom = windowHeight - mouseY;

            // Show footer when mouse is within 100px of bottom
            if (distanceFromBottom < 100) {
                setShowFooter(true);
            }
        };

        window.addEventListener("scroll", handleScroll, { passive: true });
        window.addEventListener("resize", handleScroll, { passive: true });
        window.addEventListener("mousemove", handleMouseMove, {
            passive: true,
        });
        // Check immediately on mount
        handleScroll();

        return () => {
            window.removeEventListener("scroll", handleScroll);
            window.removeEventListener("resize", handleScroll);
            window.removeEventListener("mousemove", handleMouseMove);
        };
    }, []);
    return (
        <div className="relative min-h-screen bg-offwhite/80">
            {/* Floating Transparent Header - Centered */}
            <header className="fixed top-0 left-0 right-0 z-50">
                <div className="w-full px-4 py-3 md:py-4">
                    <div className="max-w-6xl mx-auto">
                        {/* Scrollable container for mobile */}
                        <div className="overflow-x-auto scrollbar-hide">
                            <div className="flex gap-2 md:gap-3 items-center justify-center min-w-max">
                                {/* Logo */}
                                <div className="flex-shrink-0 w-16 h-16 md:w-20 md:h-20">
                                    <img
                                        src={logo}
                                        alt="pollinations.ai"
                                        className="w-full h-full object-contain invert drop-shadow-[4px_4px_0px_rgba(255,105,180,1)]"
                                    />
                                </div>

                                {/* Navigation Tabs */}
                                {tabs.map((tab) => (
                                    <NavLink
                                        key={tab.path}
                                        to={tab.path}
                                        end={tab.path === "/"}
                                        className={({ isActive }) =>
                                            `px-2 py-2 md:px-5 md:py-3 font-headline text-[10px] md:text-sm font-black uppercase tracking-wider border-r-4 border-b-4 border-rose transition-all duration-200 no-underline whitespace-nowrap ${
                                                isActive
                                                    ? "bg-lime/90 backdrop-blur-md text-offblack shadow-[4px_4px_0px_0px_rgba(255,105,180,1)]"
                                                    : "bg-offwhite/80 backdrop-blur-md text-offblack hover:bg-lime/90 hover:shadow-[4px_4px_0px_0px_rgba(255,105,180,1)]"
                                            }`
                                        }
                                    >
                                        {tab.label}
                                    </NavLink>
                                ))}

                                {/* Social Media Links + Enter Button - Hidden on smallest mobile */}
                                <div className="hidden sm:flex gap-1 md:gap-2 ml-1 md:ml-2 items-center">
                                    {Object.entries(SOCIAL_LINKS)
                                        .filter(
                                            ([key]) =>
                                                key === "discord" ||
                                                key === "github"
                                        )
                                        .map(([key, { url, icon, label }]) => (
                                            <a
                                                key={key}
                                                href={url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                title={label}
                                                className="flex-shrink-0 w-6 h-6 md:w-8 md:h-8 flex items-center justify-center bg-offwhite/80 backdrop-blur-md border-r-4 border-b-4 border-offblack/30 hover:bg-lime/90 hover:border-rose hover:shadow-[4px_4px_0px_0px_rgba(255,105,180,1)] transition-all p-1 md:p-1.5"
                                            >
                                                <img
                                                    src={icon}
                                                    alt={label}
                                                    className="w-full h-full object-contain"
                                                />
                                            </a>
                                        ))}

                                    {/* Enter Button */}
                                    <a
                                        href="https://enter.pollinations.ai"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex-shrink-0 h-6 md:h-8 px-2 md:px-3 flex items-center justify-center gap-1 bg-offwhite/80 backdrop-blur-md border-r-4 border-b-4 border-offblack/30 hover:bg-lime/90 hover:border-rose hover:shadow-[4px_4px_0px_0px_rgba(255,105,180,1)] transition-all"
                                    >
                                        <span className="font-headline text-[10px] md:text-xs font-black uppercase tracking-wider text-rose">
                                            Enter
                                        </span>
                                        <svg
                                            className="w-2.5 h-2.5 md:w-3 md:h-3 stroke-rose"
                                            fill="none"
                                            strokeWidth="2.5"
                                            viewBox="0 0 12 12"
                                        >
                                            <path
                                                d="M1 11L11 1M11 1H4M11 1v7"
                                                strokeLinecap="square"
                                            />
                                        </svg>
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content - Full Bleed */}
            <main className="w-full min-h-screen pt-24 md:pt-28 pb-20 md:pb-24">
                <Outlet />
            </main>

            {/* Floating Transparent Footer - Discrete Islands */}
            <footer
                className={`fixed bottom-0 left-0 right-0 z-40 transition-transform duration-300 ${
                    showFooter ? "translate-y-0" : "translate-y-full"
                }`}
            >
                <div className="w-full px-4 py-3 md:py-4">
                    <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-end md:justify-between gap-3">
                        {/* Left: Branding Island */}
                        <div className="bg-offwhite/70 backdrop-blur-md px-3 py-2 text-center md:text-left">
                            <p className="font-headline text-xs font-black text-offblack uppercase tracking-wider">
                                Pollinations.AI - 2025
                            </p>
                            <p className="font-body text-[10px] text-offblack/60">
                                Open source AI innovation from Berlin
                            </p>
                        </div>

                        {/* Center: Links Island */}
                        <div className="bg-offwhite/70 backdrop-blur-md px-3 py-2 mx-auto md:mx-0">
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
                                <button
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
                                    className="font-body text-offblack/60 hover:text-offblack transition-colors cursor-pointer relative"
                                >
                                    hello@pollinations.ai
                                    {emailCopied && (
                                        <span className="absolute -top-5 left-0 font-headline text-xs font-black text-rose uppercase tracking-wider">
                                            Copied!
                                        </span>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Right: Social Icons Island */}
                        <div className="bg-offwhite/70 backdrop-blur-md px-2 py-2 mx-auto md:mx-0">
                            <div className="flex gap-2">
                                {Object.entries(SOCIAL_LINKS).map(
                                    ([key, { url, icon, label }]) => (
                                        <a
                                            key={key}
                                            href={url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            title={label}
                                            className="w-6 h-6 flex items-center justify-center hover:bg-lime/90 transition-all p-1"
                                        >
                                            <img
                                                src={icon}
                                                alt={label}
                                                className="w-full h-full object-contain opacity-60 hover:opacity-100 transition-opacity"
                                            />
                                        </a>
                                    )
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
}

export default Layout;
