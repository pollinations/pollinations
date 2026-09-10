// Shared by Enter's /error route and the Connect Lab screen inventory.
export const loginErrors = {
    banned: {
        id: "account-deactivated",
        title: "Account Deactivated",
        message:
            "Your account has been deactivated. If you think this is a mistake, contact billing.",
        action: {
            label: "Contact billing",
            href: "mailto:billing@pollination.ai",
        },
    },
    default: {
        id: "login-failed",
        title: "Sign-in failed",
        message: "We couldn’t sign you in. Please try again.",
        action: { label: "Try again", href: "/sign-in" },
    },
} as const;

export function getLoginError(code: string) {
    if (code === "BANNED_USER") return loginErrors.banned;
    return Object.hasOwn(loginErrors, code)
        ? loginErrors[code as keyof typeof loginErrors]
        : loginErrors.default;
}
