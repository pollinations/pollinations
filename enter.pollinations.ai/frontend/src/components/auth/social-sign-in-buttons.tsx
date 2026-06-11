import { cn, GitHubIcon } from "@pollinations/ui";
import type {
    SocialProvider,
    SocialProviderConfig,
} from "../../lib/social-providers.ts";

type SocialSignInButtonsProps = {
    providers: ReadonlyArray<SocialProviderConfig>;
    pendingProvider: SocialProvider | null;
    isLoading?: boolean;
    error?: string | null;
    disabled?: boolean;
    className?: string;
    onSignIn: (provider: SocialProvider) => void;
};

const baseButtonClasses =
    "flex h-11 w-full items-center justify-center gap-3 rounded-md border px-4 text-sm font-medium transition-[background-color,border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

const providerButtonClasses: Record<SocialProvider, string> = {
    google: "border-[#dadce0] bg-[#ffffff] text-[#1f1f1f] hover:bg-[#f8fafd] hover:shadow-[0_1px_3px_rgba(60,64,67,0.30),0_1px_2px_rgba(60,64,67,0.15)] focus-visible:ring-[#4285f4]",
    github: "border-[#24292f] bg-[#24292f] text-[#ffffff] hover:border-[#444c56] hover:bg-[#32383f] hover:shadow-[0_1px_3px_rgba(36,41,47,0.35)] focus-visible:ring-[#24292f]",
};

/** Stacked "Continue with …" buttons, one per configured login provider. */
export function SocialSignInButtons({
    providers,
    pendingProvider,
    isLoading,
    error,
    disabled,
    className,
    onSignIn,
}: SocialSignInButtonsProps) {
    const isDisabled = disabled || isLoading || pendingProvider !== null;

    return (
        <div className={cn("flex flex-col gap-2", className)}>
            {providers.map((provider) => (
                <button
                    key={provider.id}
                    type="button"
                    onClick={() => onSignIn(provider.id)}
                    disabled={isDisabled}
                    className={cn(
                        baseButtonClasses,
                        providerButtonClasses[provider.id],
                    )}
                >
                    <span className="h-5 w-5 shrink-0" aria-hidden="true">
                        <ProviderIcon provider={provider.id} />
                    </span>
                    {pendingProvider === provider.id
                        ? "Signing in..."
                        : `Continue with ${provider.label}`}
                </button>
            ))}
            {!isLoading && providers.length === 0 && (
                <p className="text-sm text-theme-text-muted">
                    {error ?? "Sign in is unavailable."}
                </p>
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
    return <GitHubIcon className="h-full w-full" />;
}
