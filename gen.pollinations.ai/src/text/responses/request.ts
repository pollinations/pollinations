import type { CreateResponseRequest } from "@shared/schemas/openai.ts";
import {
    cleanNullAndUndefined,
    isPlainObject,
} from "../utils/objectCleaners.js";
import type { DirectResponsesTarget } from "./client.js";

export class ResponsesInvalidRequestError extends Error {
    readonly details: {
        error: {
            message: string;
            type: "invalid_request_error";
            code: "unsupported_parameter";
            param: string | null;
        };
    };

    constructor(message: string, param: string | null = "model") {
        super(message);
        this.details = {
            error: {
                message,
                type: "invalid_request_error",
                code: "unsupported_parameter",
                param,
            },
        };
    }
}

export function validateDirectResponsesRequest(
    request: CreateResponseRequest,
): void {
    const pending: unknown[] = [request.input];
    while (pending.length > 0) {
        const value = pending.pop();
        if (Array.isArray(value)) {
            pending.push(...value);
            continue;
        }
        if (!value || typeof value !== "object") continue;
        const item = value as Record<string, unknown>;
        if ("encrypted_content" in item || item.type === "item_reference") {
            throw new ResponsesInvalidRequestError(
                "Encrypted or reusable response state is not supported by the stateless Responses endpoint",
                "input",
            );
        }
        pending.push(...Object.values(item));
    }
}

export function buildDirectResponsesRequestBody(
    request: CreateResponseRequest,
    target: DirectResponsesTarget,
): Record<string, unknown> {
    const body: Record<string, unknown> = {
        ...target.defaults,
        ...request,
        model: target.model,
        store: false,
    };
    delete body.safe;

    const toolChoice = body.tool_choice;
    if (
        target.disableReasoningForForcedTools &&
        (toolChoice === "required" || isPlainObject(toolChoice))
    ) {
        body.reasoning = {
            ...(isPlainObject(body.reasoning) ? body.reasoning : {}),
            effort: "none",
        };
    }

    // SDKs often serialize inert state fields. Do not forward them because
    // this endpoint has no Pollinations or provider-side response state.
    if (body.background === false) delete body.background;
    if (Array.isArray(body.include) && body.include.length === 0)
        delete body.include;
    if (
        Array.isArray(body.context_management) &&
        body.context_management.length === 0
    )
        delete body.context_management;
    if (!body.stream) delete body.stream_options;
    return cleanNullAndUndefined(body) as Record<string, unknown>;
}
