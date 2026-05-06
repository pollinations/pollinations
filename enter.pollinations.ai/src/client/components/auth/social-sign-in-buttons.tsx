import { useState } from "react";
import { cn } from "@/util.ts";
import {
    SOCIAL_PROVIDERS,
    type SocialProvider,
} from "../../lib/social-providers.ts";

type SocialSignInButtonsProps = {
    pendingProvider: SocialProvider | null;
    disabled?: boolean;
    mode?: "all" | "github-first";
    className?: string;
    onSignIn: (provider: SocialProvider) => void;
};

export function SocialSignInButtons({
    pendingProvider,
    disabled,
    mode = "all",
    className,
    onSignIn,
}: SocialSignInButtonsProps) {
    const [showAlternatives, setShowAlternatives] = useState(false);
    const showOnlyGitHub = mode === "github-first" && !showAlternatives;
    const providers = showOnlyGitHub
        ? SOCIAL_PROVIDERS.filter((provider) => provider.id === "github")
        : SOCIAL_PROVIDERS;

    return (
        <div className={cn("flex flex-col gap-2.5", className)}>
            <div className="flex flex-col gap-2">
                {providers.map((provider) => {
                    const isPending = pendingProvider === provider.id;
                    return (
                        <button
                            key={provider.id}
                            type="button"
                            onClick={() => onSignIn(provider.id)}
                            disabled={disabled || pendingProvider !== null}
                            className={cn(
                                "flex h-11 w-full min-w-0 items-center justify-center gap-2 rounded-md border border-green-950/15 bg-white/70 px-3 text-sm font-medium text-green-950 shadow-sm transition-colors",
                                "hover:border-green-950/25 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-green-950/20",
                                "disabled:cursor-not-allowed disabled:opacity-60",
                            )}
                        >
                            <span
                                className="h-4 w-4 shrink-0"
                                aria-hidden="true"
                            >
                                <ProviderIcon provider={provider.id} />
                            </span>
                            <span className="min-w-0 truncate">
                                {isPending
                                    ? "Signing in..."
                                    : `Continue with ${provider.label}`}
                            </span>
                        </button>
                    );
                })}
            </div>

            {showOnlyGitHub && (
                <button
                    type="button"
                    onClick={() => setShowAlternatives(true)}
                    disabled={disabled || pendingProvider !== null}
                    aria-expanded={false}
                    className="self-center rounded px-2 py-1 text-xs font-medium text-green-950/60 underline underline-offset-2 transition-colors hover:text-green-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-950/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    Use another provider
                </button>
            )}
        </div>
    );
}

function ProviderIcon({ provider }: { provider: SocialProvider }) {
    if (provider === "google") {
        return (
            <img
                src="/brand-logos/google.svg"
                alt=""
                className="h-full w-full"
                draggable={false}
            />
        );
    }

    if (provider === "discord") {
        return <DiscordIcon />;
    }

    return <GitHubIcon />;
}

function DiscordIcon() {
    return (
        <svg
            viewBox="0 0 24 24"
            className="h-full w-full text-[#5865f2]"
            aria-hidden="true"
        >
            <path
                fill="currentColor"
                d="M20.32 4.37A19.8 19.8 0 0 0 15.36 2.83a.07.07 0 0 0-.08.04c-.21.38-.45.88-.62 1.27a18.27 18.27 0 0 0-5.52 0 12.84 12.84 0 0 0-.63-1.27.08.08 0 0 0-.08-.04A19.74 19.74 0 0 0 3.47 4.37a.07.07 0 0 0-.03.03C.31 9.07-.55 13.61-.13 18.1a.08.08 0 0 0 .03.06 19.9 19.9 0 0 0 6.08 3.07.08.08 0 0 0 .09-.03c.47-.64.88-1.31 1.24-2.02a.08.08 0 0 0-.04-.1 13.08 13.08 0 0 1-1.9-.91.08.08 0 0 1-.01-.13c.13-.1.25-.2.37-.29a.07.07 0 0 1 .08-.01 14.24 14.24 0 0 0 12.38 0 .07.07 0 0 1 .08.01c.12.1.25.2.38.3a.08.08 0 0 1-.01.12 12.22 12.22 0 0 1-1.9.9.08.08 0 0 0-.04.11c.36.7.77 1.38 1.23 2.02a.08.08 0 0 0 .1.03 19.84 19.84 0 0 0 6.08-3.07.08.08 0 0 0 .03-.05c.5-5.2-.84-9.7-3.77-13.71a.06.06 0 0 0-.03-.03ZM8.02 15.37c-1.18 0-2.16-1.08-2.16-2.4 0-1.32.96-2.4 2.16-2.4 1.2 0 2.18 1.09 2.16 2.4 0 1.32-.96 2.4-2.16 2.4Zm7.96 0c-1.18 0-2.16-1.08-2.16-2.4 0-1.32.96-2.4 2.16-2.4 1.2 0 2.18 1.09 2.16 2.4 0 1.32-.95 2.4-2.16 2.4Z"
            />
        </svg>
    );
}

function GitHubIcon() {
    return (
        <svg
            viewBox="0 0 24 24"
            className="h-full w-full text-gray-950"
            aria-hidden="true"
        >
            <path
                fill="currentColor"
                d="M12 .5A11.5 11.5 0 0 0 8.36 22.9c.58.11.79-.25.79-.56v-2.16c-3.21.7-3.89-1.38-3.89-1.38-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.04 1.76 2.71 1.25 3.37.96.11-.75.4-1.25.74-1.54-2.56-.29-5.26-1.28-5.26-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.06 0 0 .97-.31 3.16 1.18a10.88 10.88 0 0 1 5.76 0c2.19-1.49 3.15-1.18 3.15-1.18.63 1.6.23 2.77.11 3.06.74.81 1.19 1.84 1.19 3.1 0 4.43-2.7 5.4-5.27 5.69.41.36.78 1.06.78 2.14v3.19c0 .31.21.68.8.56A11.5 11.5 0 0 0 12 .5Z"
            />
        </svg>
    );
}
