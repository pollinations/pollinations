import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import type { z } from "zod/v4";

const validationTargetMessages: { [key in keyof ValidationTargets]: string } = {
    query: "Query parameter validation failed",
    form: "Form data validation failed",
    json: "JSON body validation failed",
    param: "Path parameter validation failed",
    header: "Header validation failed",
    cookie: "Cookie validation failed",
};

export class ValidationError extends Error {
    public readonly target: keyof ValidationTargets;
    public readonly zodError: z.ZodError;

    constructor(zodError: z.ZodError, target: keyof ValidationTargets) {
        super(validationTargetMessages[target]);
        this.target = target;
        this.zodError = zodError;
    }
}

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
                // cast is necessary because apparently zValidator
                // does not handle the typing of zod/v4 correclty
                result.error as unknown as z.ZodError,
                target,
            );
        }
    });
