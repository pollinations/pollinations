// Recovery states returned by the dashboard OAuth callback.
export const dashboardSignInErrors = {
    admin_required: {
        label: "Admin access required",
        message:
            "Your pollinations.ai account does not have admin access. Switch accounts on Pollinations, then try again.",
    },
    invalid_state: {
        label: "Sign-in link expired",
        message: "Your pollinations.ai sign-in link expired. Please try again.",
    },
    unavailable: {
        label: "Couldn’t sign in",
        message:
            "Couldn’t complete your pollinations.ai sign-in. Please try again.",
    },
} as const;
