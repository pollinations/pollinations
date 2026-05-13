import { handleOpenAIWrapperRequest } from "./handler.js";

export default {
    fetch(request, env) {
        return handleOpenAIWrapperRequest(request, {
            apiKey: env.POLLINATIONS_API_KEY,
            baseModel: env.BEE_BASE_MODEL,
            baseUrl: env.POLLINATIONS_BASE_URL,
            systemPrompt: env.BEE_SYSTEM_PROMPT,
        });
    },
};
