import { Outlet, NavLink, Link } from "react-router-dom";
import logo from "../logo/logo.svg";
import { SOCIAL_LINKS } from "../config/socialLinksList";

const tabs = [
    { path: "/", label: "Home" },
    { path: "/playground", label: "Play" },
    { path: "/projects", label: "Apps" },
    { path: "/integration", label: "Docs" },
    { path: "/community", label: "Community" },
];

function Layout() {
    return (
        <div className="relative min-h-screen bg-offblack">
            {/* Floating Transparent Header */}
            <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-sm bg-offblack/30">
                <div className="max-w-screen-xl mx-auto px-3 py-3 md:px-6 md:py-4">
                    <div className="flex items-center justify-between gap-2 md:gap-4">
                        {/* Brutalist Logo Button - Always Active */}
                        <Link
                            to="/"
                            className="flex-shrink-0 w-11 h-11 md:w-14 md:h-14 flex items-center justify-center bg-lime/90 backdrop-blur-sm border-r-4 border-b-4 border-rose shadow-[4px_4px_0px_0px_rgba(255,105,180,1)] hover:scale-105 transition-all p-2"
                        >
                            <img
                                src={logo}
                                alt="pollinations.ai"
                                className="w-full h-full object-contain"
                                style={{
                                    filter: "brightness(0) saturate(100%) invert(54%) sepia(89%) saturate(5665%) hue-rotate(311deg) brightness(102%) contrast(101%)",
                                }}
                            />
                        </Link>

                        {/* Brutalist Tab Navigation - Scrollable on mobile */}
                        <nav className="flex-1 overflow-x-auto scrollbar-hide">
                            <div className="flex gap-1 md:gap-2 items-center min-w-max">
                                {tabs.map((tab) => (
                                    <NavLink
                                        key={tab.path}
                                        to={tab.path}
                                        end={tab.path === "/"}
                                        className={({ isActive }) =>
                                            `px-2 py-2 md:px-5 md:py-3 font-headline text-[10px] md:text-sm font-black uppercase tracking-wider border-r-4 border-b-4 border-rose transition-all duration-200 no-underline whitespace-nowrap backdrop-blur-sm ${
                                                isActive
                                                    ? "bg-lime/90 text-offblack shadow-[4px_4px_0px_0px_rgba(255,105,180,1)]"
                                                    : "bg-offwhite/80 text-offblack hover:bg-lime/90 hover:shadow-[4px_4px_0px_0px_rgba(255,105,180,1)]"
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
                                                className="flex-shrink-0 w-8 h-8 md:w-10 md:h-10 flex items-center justify-center bg-offwhite/80 backdrop-blur-sm border-4 border-black hover:bg-lime/90 hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-1 transition-all p-1.5 md:p-2"
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
            <main className="w-full min-h-screen">
                <Outlet />
            </main>

            {/* Floating Transparent Footer */}
            <footer className="fixed bottom-0 left-0 right-0 z-40 backdrop-blur-sm bg-offblack/30">
                <div className="max-w-screen-xl mx-auto px-3 py-2 md:p-4 text-center">
                    <p className="font-body text-xs md:text-sm text-offwhite drop-shadow-[2px_2px_4px_rgba(0,0,0,0.8)]">
                        2024 Pollinations.AI - Free & Open Source
                    </p>
                    {/* Social icons visible on mobile footer */}
                    <div className="flex sm:hidden gap-2 justify-center mt-2">
                        {Object.entries(SOCIAL_LINKS)
                            .slice(0, 4)
                            .map(([key, { url, icon, label }]) => (
                                <a
                                    key={key}
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title={label}
                                    className="w-7 h-7 flex items-center justify-center bg-offwhite/80 backdrop-blur-sm border-2 border-black p-1"
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
            </footer>
        </div>
    );
}

export default Layout;
