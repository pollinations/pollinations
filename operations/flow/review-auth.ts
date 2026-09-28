// Review labels, route inputs and independent expected output. These values are
// never passed to Enter or shared UI to produce a product error screen.
export const loginSituations = {
    banned: {
        code: "BANNED_USER",
        id: "account-deactivated",
        title: "Account suspended",
        message: "Your Pollinations account is suspended.",
        action: {
            label: "Contact billing",
            href: "mailto:billing@pollinations.ai",
        },
    },
    staging: {
        code: "staging_is_invite-only",
        id: "staging-invite-only",
        title: "Staging is invite-only",
        message: "Staging is invite-only. Use pollinations.ai to continue.",
        action: { label: "Go to dashboard", href: "/" },
    },
    default: {
        code: "unknown",
        id: "login-failed",
        title: "Couldn’t sign in",
        message: "Couldn’t sign you in. Please try again.",
        action: { label: "Go to dashboard", href: "/" },
    },
} as const;

export const adminSignInSituations = {
    cancelled: {
        label: "Sign-in cancelled",
        title: "Sign-in cancelled",
        message: "Sign-in was cancelled. You can try again.",
    },
    admin_required: {
        label: "Admin access required",
        title: "Admin access required",
        message:
            "Your Pollinations account does not have admin access. Switch accounts on Pollinations, then try again.",
    },
    invalid_state: {
        label: "Sign-in link expired",
        title: "Sign-in link expired",
        message: "Your Pollinations sign-in link expired. Please try again.",
    },
    unavailable: {
        label: "Couldn’t sign in",
        title: "Couldn’t sign in",
        message:
            "Couldn’t complete your Pollinations sign-in. Please try again.",
    },
} as const;

// The unavailable response is a known product gap (G04 in scenario-audit.csv).
export const deviceCodeExpectations = {
    invalid: "Invalid code",
    expired: "Code expired",
    used: "This code has already been used. Return to your device, or get a new code to reconnect.",
    unavailable: "Code not recognized. Check it and try again.",
};
