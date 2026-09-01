import type { CreateResponseRequest } from "@shared/schemas/openai.ts";
import type { ServiceError } from "../types.js";
import type { DirectResponsesTarget, JsonObject } from "./types.js";

export function responsesInvalidRequest(
    message: string,
    param: string | null = "model",
): ServiceError {
    const error = new Error(message) as ServiceError;
    error.status = 400;
    error.errorCode = "invalid_request_error";
    error.details = {
        error: {
            message,
            type: "invalid_request_error",
            code: "unsupported_parameter",
            param,
        },
    };
    return error;
}

export function validateDirectResponsesRequest(
    request: CreateResponseRequest,
): void {
    for (const [index, tool] of (request.tools ?? []).entries()) {
        if (tool.type !== "function") {
            throw responsesInvalidRequest(
                "Only function tools are supported by the stateless direct Responses endpoint",
                `tools[${index}].type`,
            );
        }
    }

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
            throw responsesInvalidRequest(
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
): JsonObject {
    const body: JsonObject = {
        ...target.defaults,
        ...request,
        model: target.model,
        store: false,
    };
    delete body.safe;

    // SDKs often serialize inert state fields. Do not forward them because
    // this endpoint has no Pollinations or provider-side response state.
    if (body.previous_response_id == null) delete body.previous_response_id;
    if (body.conversation == null) delete body.conversation;
    if (body.background === false || body.background == null)
        delete body.background;
    if (Array.isArray(body.include) && body.include.length === 0)
        delete body.include;
    if (
        Array.isArray(body.context_management) &&
        body.context_management.length === 0
    )
        delete body.context_management;
    if (body.prompt == null) delete body.prompt;
    if (!body.stream) delete body.stream_options;

    for (const [key, value] of Object.entries(body)) {
        if (value === undefined || value === null) delete body[key];
    }
    return body;
}
