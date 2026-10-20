import { z } from "zod";

/**
 * Key lifetime in whole seconds from now. Shared by every path that accepts
 * an `expiresIn` for an API key (key creation, the OAuth code grant and the
 * device grant) so they all accept and reject the same values.
 */
export const apiKeyExpiresInSchema = z
    .number()
    .int()
    .positive()
    .refine(
        (seconds) =>
            Number.isFinite(new Date(Date.now() + seconds * 1000).getTime()),
        "Expiry is outside the supported date range",
    );
