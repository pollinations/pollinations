import type { ValidationTargets } from "hono";
import { validator as zValidator } from "hono-openapi";
import { z, ZodError } from "zod";
import { $ZodIssue } from "zod/v4/core";

const validationTargetMessages: { [key in keyof ValidationTargets]: string } = {
    query: "Query parameter validation failed",
    form: "Form data validation failed",
    json: "JSON body validation failed",
    param: "Path parameter validation failed",
    header: "Header validation failed",
    cookie: "Cookie validation failed",
};

export class ValidationError extends Error {
    public readonly name = "ValidationError" as const;
    public readonly target: keyof ValidationTargets;
    public readonly zodError: ZodError;

    constructor(zodError: ZodError, target: keyof ValidationTargets) {
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
                new ZodError(result.error as $ZodIssue[]),
                target,
            );
        }
    });
