import { Outlet, NavLink } from "react-router-dom";
import { useState, useEffect } from "react";
import logo from "../logo/logo.svg";
import { SOCIAL_LINKS } from "../config/socialLinksList";

const tabs = [
    { path: "/play", label: "Play" },
    { path: "/apps", label: "Apps" },
    { path: "/docs", label: "Docs" },
    { path: "/community", label: "Community" },
];

function Layout() {
    const [showFooter, setShowFooter] = useState(false);

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

        window.addEventListener("scroll", handleScroll, { passive: true });
        window.addEventListener("resize", handleScroll, { passive: true });
        // Check immediately on mount
        handleScroll();

        return () => {
            window.removeEventListener("scroll", handleScroll);
            window.removeEventListener("resize", handleScroll);
        };
    }, []);
    return (
        <div className="relative min-h-screen bg-offwhite/80">
            {/* Floating Transparent Header */}
            <header className="fixed top-0 left-0 right-0 z-50">
                <div className="w-full px-4 py-3 md:py-4">
                    <div className="max-w-4xl mx-auto flex items-center gap-2 md:gap-4">
                        {/* Brutalist Tab Navigation - Scrollable on mobile */}
                        <nav className="flex-1 overflow-x-auto scrollbar-hide">
                            <div className="flex gap-1 md:gap-2 items-center min-w-max">
                                {/* Logo Button - Replaces Home */}
                                <NavLink
                                    to="/"
                                    end
                                    className={({ isActive }) =>
                                        `flex-shrink-0 w-12 h-12 md:w-16 md:h-16 p-2.5 md:p-3 flex items-center justify-center border-r-4 border-b-4 border-rose transition-all duration-200 ${
                                            isActive
                                                ? "bg-lime/90 backdrop-blur-md shadow-[4px_4px_0px_0px_rgba(255,105,180,1)]"
                                                : "bg-offwhite/80 backdrop-blur-md hover:bg-lime/90 hover:shadow-[4px_4px_0px_0px_rgba(255,105,180,1)]"
                                        }`
                                    }
                                >
                                    <img
                                        src={logo}
                                        alt="pollinations.ai"
                                        className="w-full h-full object-contain invert"
                                    />
                                </NavLink>

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

                                {/* Social Media Links - Hidden on smallest mobile */}
                                <div className="hidden sm:flex gap-1 md:gap-2 ml-2 md:ml-4">
                                    {Object.entries(SOCIAL_LINKS).map(
                                        ([key, { url, icon, label }]) => (
                                            <a
                                                key={key}
                                                href={url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                title={label}
                                                className="flex-shrink-0 w-8 h-8 md:w-10 md:h-10 flex items-center justify-center bg-offwhite/80 backdrop-blur-md border-r-4 border-b-4 border-offblack/30 hover:bg-lime/90 hover:border-rose hover:shadow-[4px_4px_0px_0px_rgba(255,105,180,1)] transition-all p-1.5 md:p-2"
                                            >
                                                <img
                                                    src={icon}
                                                    alt={label}
                                                    className="w-full h-full object-contain"
                                                />
                                            </a>
                                        )
                                    )}
                                </div>
                            </div>
                        </nav>
                    </div>
                </div>
            </header>

            {/* Main Content - Full Bleed */}
            <main className="w-full min-h-screen pt-24 md:pt-28 pb-20 md:pb-24">
                <Outlet />
            </main>

            {/* Floating Transparent Footer - Smart Hide/Show */}
            <footer
                className={`fixed bottom-0 left-0 right-0 z-40 bg-offwhite/60 backdrop-blur-sm border-t-2 border-offblack/10 transition-transform duration-300 ${
                    showFooter ? "translate-y-0" : "translate-y-full"
                }`}
            >
                <div className="w-full px-4 py-3 md:py-4">
                    <div className="max-w-4xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-3 text-center md:text-left">
                        {/* Left: Branding */}
                        <div className="space-y-0.5">
                            <p className="font-headline text-xs font-black text-offblack uppercase tracking-wider">
                                Pollinations.AI - 2025
                            </p>
                            <p className="font-body text-xs text-offblack/60">
                                Open source AI innovation from Berlin
                            </p>
                        </div>

                        {/* Center: Links */}
                        <div className="flex items-center justify-center gap-3 text-xs">
                            <a
                                href="/terms"
                                className="font-body text-offblack/60 hover:text-offblack transition-colors"
                            >
                                Terms & Conditions
                            </a>
                            <span className="text-offblack/30">•</span>
                            <button
                                type="button"
                                onClick={() => {
                                    navigator.clipboard.writeText(
                                        "hello@pollinations.ai"
                                    );
                                    alert("Email copied to clipboard!");
                                }}
                                className="font-body text-offblack/60 hover:text-offblack transition-colors cursor-pointer"
                            >
                                hello@pollinations.ai
                            </button>
                        </div>

                        {/* Right: Social Links */}
                        <div className="flex gap-2 justify-center md:justify-end">
                            {Object.entries(SOCIAL_LINKS)
                                .slice(0, 5)
                                .map(([key, { url, icon, label }]) => (
                                    <a
                                        key={key}
                                        href={url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title={label}
                                        className="w-7 h-7 flex items-center justify-center bg-offwhite/80 border-2 border-offblack/20 hover:border-rose hover:bg-lime/90 transition-all p-1"
                                    >
                                        <img
                                            src={icon}
                                            alt={label}
                                            className="w-full h-full object-contain"
                                        />
                                    </a>
                                ))}
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
}

export default Layout;
