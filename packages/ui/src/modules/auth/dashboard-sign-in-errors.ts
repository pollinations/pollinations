// Recovery states returned by the dashboard OAuth callback.
export const dashboardSignInErrors = {
    admin_required: {
        label: "Admin access required",
        message:
            "This account does not have admin access. Switch accounts on Pollinations, then try again.",
    },
    invalid_state: {
        label: "Sign-in link expired",
        message: "This sign-in link expired. Please try again.",
    },
    unavailable: {
        label: "Sign-in unavailable",
        message:
            "Couldn’t complete your pollinations.ai sign-in. Please try again.",
    },
} as const;
