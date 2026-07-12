import type { RequestData } from "./types.js";
import { validateTextGenerationParams } from "./utils/parameterValidators.js";

export interface ExpressLikeRequest {
    query: Record<string, unknown>;
    body: Record<string, unknown>;
    path: string;
    params: Record<string, string>;
    method: string;
    headers: Record<string, string>;
    url?: string;
}

export function getRequestData(req: ExpressLikeRequest): RequestData {
    const data: Record<string, unknown> = { ...req.query, ...req.body };
    const validated = validateTextGenerationParams(data);

    const systemPrompt = (data.system as string) || null;

    const messages = (data.messages as RequestData["messages"]) || [
        { role: "user", content: req.params[0] },
    ];
    if (systemPrompt) {
        messages.unshift({ role: "system", content: systemPrompt });
    }

    return {
        // Validated params (temperature, top_p, seed, model, stream, etc.)
        ...validated,
        messages,
        // Passthrough params not handled by validateTextGenerationParams
        tools: data.tools as unknown[] | undefined,
        tool_choice: data.tool_choice,
        modalities: data.modalities as string[] | undefined,
        audio: data.audio as Record<string, unknown> | undefined,
        response_format: data.response_format as RequestData["response_format"],
        stop: data.stop,
        stream_options: data.stream_options as
            | Record<string, unknown>
            | undefined,
        logprobs: data.logprobs,
        top_logprobs: data.top_logprobs,
        logit_bias: data.logit_bias,
        user: data.user,
    } as RequestData;
}
