import {
    ValidationError,
    type ValidationTarget,
} from "@shared/http/validation-error.ts";
import type { ValidationTargets } from "hono";
import { validator as zValidator } from "hono-openapi";
import { ZodError, type z } from "zod";
import type { $ZodIssue } from "zod/v4/core";

export const validator = <
    T extends z.ZodType,
    Target extends keyof ValidationTargets,
>(
    target: Target,
    schema: T,
) =>
    zValidator(target, schema, (result, _c) => {
        if (!result.success) {
            throw new ValidationError(
                new ZodError(result.error as $ZodIssue[]),
                target as ValidationTarget,
            );
        }
    });
