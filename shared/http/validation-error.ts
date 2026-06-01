import type { ZodError } from "zod";

export type ValidationTarget =
    | "query"
    | "form"
    | "json"
    | "param"
    | "header"
    | "cookie";

const validationTargetMessages: Record<ValidationTarget, string> = {
    query: "Query parameter validation failed",
    form: "Form data validation failed",
    json: "JSON body validation failed",
    param: "Path parameter validation failed",
    header: "Header validation failed",
    cookie: "Cookie validation failed",
};

export class ValidationError extends Error {
    public readonly name = "ValidationError" as const;
    public readonly target: ValidationTarget;
    public readonly zodError: ZodError;

    constructor(zodError: ZodError, target: ValidationTarget) {
        super(validationTargetMessages[target]);
        this.target = target;
        this.zodError = zodError;
    }
}
