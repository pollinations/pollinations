import debug from "debug";
import dotenv from "dotenv";
import * as sharedUtils from "../shared/extractFromRequest.js";
import { validateTextGenerationParams } from "./utils/parameterValidators.js";

const { extractReferrer } = sharedUtils as any;

dotenv.config();
dotenv.config({ path: ".env.local" });

const log = debug("pollinations:requestUtils");

export function getRequestData(req: any): any {
    const data = { ...req.query, ...req.body };
    const validated = validateTextGenerationParams(data);

    const systemPrompt = data.system || null;
    const isPrivate = req.path?.startsWith("/openai") || validated.private === true;
    const referrer = extractReferrer(req);

    const messages = data.messages || [{ role: "user", content: req.params[0] }];
    if (systemPrompt) {
        messages.unshift({ role: "system", content: systemPrompt });
    }

    return {
        messages,
        jsonMode: validated.jsonMode,
        seed: validated.seed,
        model: validated.model,
        temperature: validated.temperature,
        top_p: validated.top_p,
        presence_penalty: validated.presence_penalty,
        frequency_penalty: validated.frequency_penalty,
        repetition_penalty: validated.repetition_penalty,
        referrer,
        stream: validated.stream,
        isPrivate,
        voice: validated.voice,
        tools: data.tools,
        tool_choice: data.tool_choice,
        modalities: data.modalities,
        audio: data.audio,
        reasoning_effort: validated.reasoning_effort,
        thinking_budget: validated.thinking_budget,
        response_format: data.response_format,
        max_tokens: data.max_tokens,
        max_completion_tokens: data.max_completion_tokens,
        stop: data.stop,
        stream_options: data.stream_options,
        logprobs: data.logprobs,
        top_logprobs: data.top_logprobs,
        logit_bias: data.logit_bias,
        user: data.user,
    };
}
