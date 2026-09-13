// Error codes, copy and recovery shared by the auth server, UI and flow preview.
export const loginErrors = {
    banned: {
        code: "BANNED_USER",
        id: "account-deactivated",
        title: "Account suspended",
        message:
            "Your pollinations.ai account is suspended. If you think this is a mistake, contact billing.",
        action: {
            label: "Contact billing",
            href: "mailto:billing@pollinations.ai",
        },
    },
    staging: {
        code: "STAGING_ACCESS_DENIED",
        id: "staging-invite-only",
        title: "Staging is invite-only",
        message:
            "Your pollinations.ai account doesn’t have access to staging. Use pollinations.ai to continue.",
        action: {
            label: "Visit pollinations.ai",
            href: "https://pollinations.ai/",
        },
    },
    default: {
        code: "unknown",
        id: "login-failed",
        title: "Couldn’t sign in",
        message:
            "We couldn’t sign you in to your pollinations.ai account. Please try again.",
        action: { label: "Try again", href: "/sign-in" },
    },
} as const;

export function getLoginError(code: string) {
    return (
        Object.entries(loginErrors).find(
            ([key, error]) => key === code || error.code === code,
        )?.[1] ?? loginErrors.default
    );
}
