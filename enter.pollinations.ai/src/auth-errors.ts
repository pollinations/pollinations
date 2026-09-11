import { loginErrors } from "@shared/auth/login-errors.ts";
import { APIError, createAuthMiddleware } from "better-auth/api";

// Provider profile mapping errors bypass Better Auth's callback redirect helper.
export const signInErrorRedirect = createAuthMiddleware(async (ctx) => {
    const error = ctx.context.returned;
    if (
        ctx.path === "/callback/github" &&
        error instanceof APIError &&
        error.body?.code === loginErrors.staging.code
    ) {
        throw ctx.redirect(`/error?error=${loginErrors.staging.code}`);
    }
});
