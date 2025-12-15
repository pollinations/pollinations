import type { FC, ReactNode } from "react";

type HeaderProps = {
    children: ReactNode;
};

export const Header: FC<HeaderProps> = ({ children }) => {
    return (
        <>
            <div className="flex flex-col sm:flex-row justify-between gap-4 sm:items-center">
                <div className="flex flex-col gap-2">
                    <img
                        src="/logo_text_black.svg"
                        alt="pollinations.ai"
                        className="h-12 w-full sm:w-auto object-contain object-center sm:object-left invert"
                    />
                    <div className="flex flex-wrap justify-center sm:justify-start gap-1.5 text-xs">
                        <a
                            href="https://discord.gg/pollinations"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-black/10 hover:bg-black/20 transition-colors rounded-full px-2 py-0.5 whitespace-nowrap"
                        >
                            💬 <span className="sm:hidden">Discord</span>
                            <span className="hidden sm:inline">
                                Join our Discord
                            </span>
                        </a>
                        <a
                            href="https://discord.com/channels/885844321461485618/1432378056126894343"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-black/10 hover:bg-black/20 transition-colors rounded-full px-2 py-0.5 whitespace-nowrap"
                        >
                            🧪 <span className="sm:hidden">Beta</span>
                            <span className="hidden sm:inline">
                                #pollen-beta channel
                            </span>
                        </a>
                        <a
                            href="https://github.com/pollinations/pollinations/issues"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-black/10 hover:bg-black/20 transition-colors rounded-full px-2 py-0.5 whitespace-nowrap"
                        >
                            🐛 <span className="sm:hidden">Report</span>
                            <span className="hidden sm:inline">
                                Report an issue
                            </span>
                        </a>
                    </div>
                </div>
                <div className="flex flex-row gap-4 items-start justify-center sm:justify-end">
                    {children}
                </div>
            </div>
        </>
    );
};
