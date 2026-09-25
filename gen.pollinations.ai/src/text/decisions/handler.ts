import { buildUsageHeaders } from "@shared/registry/usage-headers.ts";
import type {
    CreateDecisionRequest,
    CreateDecisionResponse,
} from "@shared/schemas/decisions.ts";
import type { Context } from "hono";
import type { Env } from "@/env.ts";
import { syncTextEnvironment } from "../environment.js";
import { throwTextError } from "../errors.js";
import { requestDecision } from "../systemOneClient.js";
import { resolveModelConfig } from "../utils/modelResolver.js";

/**
 * Native decisions route. The body is already the provider's own shape, so
 * nothing is transformed on the way out; on the way back the provider's
 * response is re-keyed to our model identity and billed through usage headers
 * like the other non-OpenAI response bodies (transcriptions, TTS).
 */
export async function generateDecision(c: Context<Env>): Promise<Response> {
    const { state, questions } = c.req.valid(
        "json" as never,
    ) as CreateDecisionRequest;

    syncTextEnvironment(c.env);
    const { options } = resolveModelConfig([], {
        model: c.var.model.resolved,
    });

    const { result, requestUrl } = await requestDecision(
        { state, questions },
        options,
    ).catch(throwTextError);
    c.set("upstreamRequestUrl", requestUrl);

    const body: CreateDecisionResponse = {
        id: `dec-${crypto.randomUUID()}`,
        // The registry owns public model identity: the provider answers with
        // its own dated build id, which is not a name callers can request.
        model: c.var.model.resolved,
        provider: c.var.model.definition.publisher ?? "",
        answers: result.answers as CreateDecisionResponse["answers"],
        usage: {
            input_tokens: result.usage.input_tokens,
            output_tokens: result.usage.output_tokens,
        },
    };

    return Response.json(body, {
        headers: buildUsageHeaders(c.var.model.resolved, {
            promptTextTokens: result.usage.input_tokens,
            completionTextTokens: result.usage.output_tokens,
        }),
    });
}
