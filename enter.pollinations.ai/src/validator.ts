import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import type { z } from "zod";

// A throwing zValidator so we can handle errors in one place
export const validator = <
    T extends z.ZodSchema,
    Target extends keyof ValidationTargets,
>(
    target: Target,
    schema: T,
) =>
    zValidator(target, schema, (result, _c) => {
        if (!result.success) {
            throw result.error;
        }
    });
