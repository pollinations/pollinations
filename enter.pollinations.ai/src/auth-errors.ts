import { loginErrors } from "@shared/auth/login-errors.ts";
import { APIError, createAuthMiddleware } from "better-auth/api";

export const handleAuthErrors = createAuthMiddleware(async (ctx) => {
    const error = ctx.context.returned;
    // Better Auth returns null when the provider cannot supply profile details.
    // That is a failed lookup, not a successful account-info response.
    if (ctx.path === "/account-info" && error === null) {
        throw new APIError("BAD_GATEWAY", {
            code: "ACCOUNT_INFO_UNAVAILABLE",
            message:
                "Could not load your connected account's details. Please try again.",
        });
    }
    // Provider profile mapping errors bypass Better Auth's callback redirect helper.
    if (
        ctx.path === "/callback/github" &&
        error instanceof APIError &&
        error.body?.code === loginErrors.staging.code
    ) {
        throw ctx.redirect(`/error?error=${loginErrors.staging.code}`);
    }
});
