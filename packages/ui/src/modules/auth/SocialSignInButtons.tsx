import { cn } from "../../lib/cn.ts";
import { GitHubIcon, GoogleIcon } from "../../primitives/icons/index.tsx";
import type {
    SocialProvider,
    SocialProviderConfig,
} from "./social-providers.ts";

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
    "polli:flex polli:h-11 polli:w-full polli:items-center polli:justify-center polli:gap-3 polli:rounded-md polli:border polli:px-4 polli:text-sm polli:font-medium polli:transition-[background-color,border-color,box-shadow] polli:focus-visible:outline-none polli:focus-visible:ring-2 polli:focus-visible:ring-offset-2 polli:disabled:cursor-not-allowed polli:disabled:opacity-60";

const providerButtonClasses: Record<SocialProvider, string> = {
    google: "polli:border-[#dadce0] polli:bg-[#ffffff] polli:text-[#1f1f1f] polli:hover:bg-[#f8fafd] polli:hover:shadow-[0_1px_3px_rgba(60,64,67,0.30),0_1px_2px_rgba(60,64,67,0.15)] polli:focus-visible:ring-[#4285f4]",
    github: "polli:border-[#24292f] polli:bg-[#24292f] polli:text-[#ffffff] polli:hover:border-[#444c56] polli:hover:bg-[#32383f] polli:hover:shadow-[0_1px_3px_rgba(36,41,47,0.35)] polli:focus-visible:ring-[#24292f]",
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
        <div className={cn("polli:flex polli:flex-col polli:gap-2", className)}>
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
                    <span
                        className="polli:h-5 polli:w-5 polli:shrink-0"
                        aria-hidden="true"
                    >
                        <ProviderIcon provider={provider.id} />
                    </span>
                    {pendingProvider === provider.id
                        ? "Signing in..."
                        : `Continue with ${provider.label}`}
                </button>
            ))}
            {!isLoading && providers.length === 0 && (
                <p className="polli:text-sm polli:text-theme-text-muted">
                    {error ?? "Sign in is unavailable."}
                </p>
            )}
        </div>
    );
}

function ProviderIcon({ provider }: { provider: SocialProvider }) {
    if (provider === "google") {
        return <GoogleIcon className="polli:h-full polli:w-full" />;
    }
    return <GitHubIcon className="polli:h-full polli:w-full" />;
}
