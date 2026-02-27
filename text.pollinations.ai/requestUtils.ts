import dotenv from "dotenv";
import { extractReferrer } from "../shared/extractFromRequest.js";
import type { RequestData } from "./types.js";
import { validateTextGenerationParams } from "./utils/parameterValidators.js";

dotenv.config();
dotenv.config({ path: ".env.local" });

export interface ExpressLikeRequest {
    query: Record<string, unknown>;
    body: Record<string, unknown>;
    path: string;
    params: Record<string, string>;
    method: string;
    headers: Record<string, string>;
}

export function getRequestData(req: ExpressLikeRequest): RequestData {
    const data: Record<string, unknown> = { ...req.query, ...req.body };
    const validated = validateTextGenerationParams(data);

    const systemPrompt = (data.system as string) || null;
    const isPrivate =
        req.path?.startsWith("/openai") || validated.private === true;
    const referrer = extractReferrer(req);

    const messages = (data.messages as RequestData["messages"]) || [
        { role: "user", content: req.params[0] },
    ];
    if (systemPrompt) {
        messages.unshift({ role: "system", content: systemPrompt });
    }

    return {
        messages,
        jsonMode: validated.jsonMode as boolean | undefined,
        seed: validated.seed as number | undefined,
        model: validated.model as string | undefined,
        temperature: validated.temperature as number | undefined,
        top_p: validated.top_p as number | undefined,
        presence_penalty: validated.presence_penalty as number | undefined,
        frequency_penalty: validated.frequency_penalty as number | undefined,
        repetition_penalty: validated.repetition_penalty as number | undefined,
        referrer,
        stream: validated.stream as boolean | undefined,
        isPrivate,
        voice: validated.voice as string | undefined,
        tools: data.tools as unknown[] | undefined,
        tool_choice: data.tool_choice,
        modalities: data.modalities as string[] | undefined,
        audio: data.audio as Record<string, unknown> | undefined,
        reasoning_effort: validated.reasoning_effort as string | undefined,
        thinking_budget: validated.thinking_budget as number | undefined,
        response_format: data.response_format as RequestData["response_format"],
        max_tokens: data.max_tokens as number | undefined,
        max_completion_tokens: data.max_completion_tokens as number | undefined,
        stop: data.stop,
        stream_options: data.stream_options as
            | Record<string, unknown>
            | undefined,
        logprobs: data.logprobs,
        top_logprobs: data.top_logprobs,
        logit_bias: data.logit_bias,
        user: data.user,
    };
}
