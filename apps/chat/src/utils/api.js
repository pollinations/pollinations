// Pollinations API utilities — updated to match gen.pollinations.ai spec
const BASE_URL = "https://gen.pollinations.ai";
const ENV_API_TOKEN = import.meta.env.VITE_POLLINATIONS_API_KEY || "";
export const BYOP_STORAGE_KEY = "pollinations_byop_api_key";

const getApiToken = () => {
    if (typeof window !== "undefined") {
        try {
            const userKey = window.localStorage.getItem(BYOP_STORAGE_KEY);
            if (userKey) return userKey;
        } catch {
            /* ignore localStorage failures */
        }
    }
    return ENV_API_TOKEN;
};

let textModels = [];
let imageModels = [];
let videoModels = [];
let audioModels = [];
let abortController = null;

let modelsCache = null;
let modelsCacheTime = null;
const CACHE_DURATION = 5 * 60 * 1000;

const getRealModelName = (modelId) => {
    if (typeof modelId !== "string") return "Unknown Model";
    return modelId;
};

// Map server response → sanitized client-facing error.
// We intentionally do NOT surface raw server messages: the user sees a
// short, friendly summary, and the UI uses `errorType` to decide how to
// react (e.g. show the BYOP button on auth failures).
const buildClientError = (code) => {
    let errorType = "unknown";
    let message = "Something went wrong. Please try again.";

    if (code === 401) {
        errorType = "auth";
        message = "Authentication failed. Add your own API key to continue.";
    } else if (code === 402) {
        errorType = "balance";
        message = "Out of Pollen credits. Top up or use your own API key.";
    } else if (code === 403) {
        errorType = "permission";
        message = "This API key doesn't have access to that model.";
    } else if (code === 429) {
        errorType = "rate_limit";
        message = "You're sending requests too quickly. Try again in a moment.";
    } else if (code >= 500) {
        errorType = "server";
        message = "The service is temporarily unavailable. Please try again.";
    } else if (code >= 400) {
        errorType = "client";
        message = "Request could not be completed.";
    }

    const err = new Error(message);
    err.code = code;
    err.errorType = errorType;
    return err;
};

const parseApiError = async (response) => {
    // Drain the body so the connection isn't left open, but never reflect
    // its contents back to the user.
    try {
        await response.text();
    } catch {
        /* ignore */
    }
    return buildClientError(response.status);
};

export const loadModels = async () => {
    if (
        modelsCache &&
        modelsCacheTime &&
        Date.now() - modelsCacheTime < CACHE_DURATION
    ) {
        return modelsCache;
    }

    const token = getApiToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    const [textRes, imageRes, audioRes] = await Promise.allSettled([
        fetch(`${BASE_URL}/v1/models`, { headers }),
        fetch(`${BASE_URL}/image/models`, { headers }),
        fetch(`${BASE_URL}/audio/models`, { headers }),
    ]);

    // Text models
    if (textRes.status === "fulfilled" && textRes.value.ok) {
        const data = await textRes.value.json();
        const arr = Array.isArray(data) ? data : data.data;
        if (Array.isArray(arr)) {
            textModels = arr.map((m) => ({
                id: m.id || m.name || m,
                name: m.description || getRealModelName(m.id || m.name || m),
                description: m.description || m.id || m.name || m,
                type: "text",
                ownedBy: m.owned_by || "unknown",
                created: m.created,
                supportsVision: m.vision === true,
                supportsAudio: m.audio === true,
                inputModalities: m.input_modalities || ["text"],
                outputModalities: m.output_modalities || ["text"],
                tier: m.tier || "unknown",
                community: m.community || false,
            }));
        }
    } else {
        textModels = [];
    }

    // Image + video models
    if (imageRes.status === "fulfilled" && imageRes.value.ok) {
        const data = await imageRes.value.json();
        if (Array.isArray(data)) {
            const all = data.map((m) => {
                const id = typeof m === "string" ? m : m.name || m.id || m;
                const outputMods = m.output_modalities || ["image"];
                return {
                    id,
                    name:
                        typeof m === "object" && m.description
                            ? m.description
                            : getRealModelName(id),
                    description: m.description || id,
                    type: outputMods.includes("video") ? "video" : "image",
                    tier: m.tier || "unknown",
                    outputModalities: outputMods,
                };
            });
            imageModels = all.filter((m) => m.type === "image");
            videoModels = all.filter((m) => m.type === "video");
        }
    } else {
        imageModels = [];
        videoModels = [];
    }

    // Audio models
    if (audioRes.status === "fulfilled" && audioRes.value.ok) {
        const data = await audioRes.value.json();
        const arr = Array.isArray(data) ? data : data.data;
        if (Array.isArray(arr)) {
            audioModels = arr.map((m) => {
                const id = typeof m === "string" ? m : m.name || m.id || m;
                return {
                    id,
                    name:
                        typeof m === "object" && m.description
                            ? m.description
                            : getRealModelName(id),
                    description: m.description || id,
                    type: "audio",
                    tier: m.tier || "unknown",
                };
            });
        }
    }

    const result = { textModels, imageModels, videoModels, audioModels };
    modelsCache = result;
    modelsCacheTime = Date.now();
    return result;
};

export const getModels = () => ({
    textModels,
    imageModels,
    videoModels,
    audioModels,
});

export const initializeModels = async () => {
    const {
        textModels: tm,
        imageModels: im,
        videoModels: vm,
        audioModels: am,
    } = await loadModels();
    const toObj = (arr) =>
        Object.fromEntries(arr.map((m) => [m.id, { name: m.name, ...m }]));
    return {
        textModels: toObj(tm),
        imageModels: toObj(im),
        videoModels: toObj(vm),
        audioModels: toObj(am),
    };
};

const _getCurrentModelInfo = (modelId) => {
    return [...textModels, ...imageModels, ...videoModels, ...audioModels].find(
        (m) => m.id === modelId,
    );
};

const extractBase64FromDataUrl = (dataUrl) => {
    if (typeof dataUrl !== "string") return { base64: "", mimeType: null };
    const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
    if (match) return { base64: match[2], mimeType: match[1] };
    const commaIndex = dataUrl.indexOf(",");
    if (commaIndex >= 0)
        return { base64: dataUrl.slice(commaIndex + 1), mimeType: null };
    return { base64: dataUrl, mimeType: null };
};

export const formatMessagesForAPI = (messages, _modelId) => {
    return messages.map((msg) => {
        const parts = [];
        const textContent = typeof msg.content === "string" ? msg.content : "";
        if (textContent) parts.push({ type: "text", text: textContent });

        const attachments = Array.isArray(msg.attachments)
            ? msg.attachments
            : [];
        const legacyImage =
            !attachments.length && msg.image?.src
                ? [
                      {
                          name: msg.image.name || "image",
                          data: msg.image.src,
                          mimeType: msg.image.mimeType || "image/png",
                          isImage: true,
                      },
                  ]
                : [];

        for (const attachment of [...attachments, ...legacyImage]) {
            if (!attachment) continue;
            let base64Data = attachment.data || attachment.base64 || "";
            let mimeType =
                attachment.mimeType ||
                attachment.type ||
                "application/octet-stream";

            if (!base64Data && attachment.preview) {
                const e = extractBase64FromDataUrl(attachment.preview);
                base64Data = e.base64;
                if (e.mimeType && !attachment.mimeType) mimeType = e.mimeType;
            }
            if (!base64Data && typeof attachment.src === "string") {
                const e = extractBase64FromDataUrl(attachment.src);
                base64Data = e.base64;
                if (e.mimeType) mimeType = e.mimeType;
            }
            if (!base64Data) continue;

            const isImage = attachment.isImage ?? mimeType.startsWith("image/");
            if (isImage && attachment.preview?.startsWith("http")) {
                parts.push({
                    type: "image_url",
                    image_url: { url: attachment.preview },
                });
                continue;
            }
            if (isImage && base64Data) {
                parts.push({
                    type: "image_url",
                    image_url: { url: `data:${mimeType};base64,${base64Data}` },
                });
            }
        }

        if (parts.length === 1 && parts[0].type === "text")
            return { role: msg.role, content: parts[0].text };
        if (parts.length > 0) return { role: msg.role, content: parts };
        return { role: msg.role, content: textContent || "" };
    });
};

const containsChartRequest = (messages = []) => {
    if (!Array.isArray(messages) || messages.length === 0) return false;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "user") return false;
    const content =
        typeof last.content === "string" ? last.content.toLowerCase() : "";
    return /(chart|graph|plot|visualiz|scatter|line\s+chart|bar\s+chart|pie\s+chart|histogram|trend)/.test(
        content,
    );
};

export const sendMessage = async (
    messages,
    onChunk,
    onComplete,
    onError,
    modelId,
    generationConfig = {},
) => {
    const selectedModelId = modelId || "openai-large";
    const { maxTokens = 2000, temperature = 0.7, topP = 1 } = generationConfig;
    const isClaude = selectedModelId.includes("claude");
    const finalTemperature = isClaude ? 1 : temperature;
    const chartRequested = containsChartRequest(messages);

    const tools = [
        {
            type: "function",
            function: {
                name: "create_chart",
                description:
                    "Create a chart or graph visualization from data points.",
                parameters: {
                    type: "object",
                    properties: {
                        title: {
                            type: "string",
                            description: "Title displayed above the chart.",
                        },
                        data: {
                            type: "array",
                            items: { type: "object" },
                            description: "Array of data objects.",
                        },
                        series: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    key: { type: "string" },
                                    name: { type: "string" },
                                    color: { type: "string" },
                                },
                                required: ["key", "name"],
                            },
                        },
                        xKey: { type: "string" },
                        xLabel: { type: "string" },
                        yLabel: { type: "string" },
                    },
                    required: ["title", "data", "series", "xKey"],
                },
            },
        },
    ];

    try {
        if (abortController) abortController.abort();
        abortController = new AbortController();

        const formattedMessages = formatMessagesForAPI(
            messages,
            selectedModelId,
        );
        const requestBody = {
            model: selectedModelId,
            messages: formattedMessages,
            max_tokens: maxTokens,
            temperature: finalTemperature,
            tools,
            tool_choice: chartRequested
                ? { type: "function", function: { name: "create_chart" } }
                : "auto",
            stream: true,
        };
        if (topP !== 1) requestBody.top_p = topP;
        if (isClaude) {
            requestBody.thinking = { type: "enabled" };
            requestBody.reasoning_effort = "high";
        }

        const headers = { "Content-Type": "application/json" };
        const token = getApiToken();
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
            method: "POST",
            headers,
            body: JSON.stringify(requestBody),
            signal: abortController.signal,
        });

        if (!response.ok) {
            throw await parseApiError(response);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = "";
        const functionBuffers = {};
        const collectedFunctionCalls = [];
        let lastFunctionName = null;
        let pendingData = "";
        let sseBuffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            sseBuffer += decoder.decode(value, { stream: true });
            const events = sseBuffer.split("\n\n");
            sseBuffer = events.pop() ?? "";

            for (const event of events) {
                for (const line of event.split("\n")) {
                    if (!line.startsWith("data: ")) continue;
                    const payload = line.slice(6).trim();
                    if (!payload || payload === "[DONE]") continue;

                    const dataString = pendingData
                        ? pendingData + payload
                        : payload;
                    let parsed;
                    try {
                        parsed = JSON.parse(dataString);
                        pendingData = "";
                    } catch {
                        pendingData = dataString;
                        continue;
                    }

                    const delta = parsed?.choices?.[0]?.delta;
                    if (!delta) continue;

                    const content = delta?.content || "";
                    if (content) {
                        fullContent += content;
                        if (onChunk) onChunk(content, fullContent, "");
                    }

                    const toolCall = delta?.tool_calls?.[0];
                    if (toolCall?.function) {
                        const fn = toolCall.function;
                        const name =
                            fn?.name || lastFunctionName || "unknown_function";
                        if (fn?.name) lastFunctionName = fn.name;
                        const argChunk = fn?.arguments || "";
                        if (!functionBuffers[name]) functionBuffers[name] = "";
                        functionBuffers[name] += argChunk;
                        try {
                            const attempt = JSON.parse(functionBuffers[name]);
                            collectedFunctionCalls.push({
                                name,
                                arguments:
                                    typeof attempt === "string"
                                        ? JSON.parse(attempt)
                                        : attempt,
                            });
                            delete functionBuffers[name];
                        } catch {
                            /* accumulating */
                        }
                    }
                }
            }
        }

        let finalContent =
            typeof fullContent === "string"
                ? fullContent.replace(/\s+$/g, "").replace(/\n{3,}/g, "\n\n")
                : fullContent;

        for (const call of collectedFunctionCalls) {
            if (call.name === "create_chart") {
                try {
                    const args = call.arguments;
                    finalContent += `\n\n__CHART__${JSON.stringify({
                        type: "chart",
                        output: {
                            title: args.title,
                            data: args.data,
                            series: args.series,
                            xKey: args.xKey,
                            xLabel: args.xLabel || "X Axis",
                            yLabel: args.yLabel || "Y Axis",
                        },
                    })}__CHART__`;
                } catch {
                    /* skip malformed chart */
                }
            }
        }

        if (onComplete) onComplete(finalContent, "");
        abortController = null;
        return finalContent;
    } catch (error) {
        abortController = null;
        if (error.name === "AbortError") {
            if (onError) onError(new Error("User aborted"));
            return null;
        }
        if (onError) onError(error);
        throw error;
    }
};

export const stopGeneration = () => {
    if (abortController) {
        abortController.abort();
        abortController = null;
    }
};

export const generateImage = async (prompt, options = {}) => {
    const {
        model = "flux",
        width = 1024,
        height = 1024,
        seed = Math.floor(Math.random() * 2147483647),
        nologo = false,
        enhance = false,
        nofeed = false,
        safe = false,
        quality = "medium",
    } = options;

    const params = new URLSearchParams({
        model,
        width,
        height,
        seed,
        enhance,
        nologo,
        nofeed,
        safe,
        quality,
    });
    const url = `${BASE_URL}/image/${encodeURIComponent(prompt)}?${params}`;
    const token = getApiToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const response = await fetch(url, { headers });
    if (!response.ok) throw await parseApiError(response);

    const blob = await response.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () =>
            resolve({ url: reader.result, prompt, model, width, height, seed });
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

export const generateVideo = async (prompt, options = {}) => {
    const {
        model = "veo",
        seed = Math.floor(Math.random() * 2147483647),
        nologo = false,
        nofeed = false,
    } = options;

    const params = new URLSearchParams({ model, seed, nologo, nofeed });
    // Correct endpoint: /video/{prompt}  (not /image/{prompt})
    const url = `${BASE_URL}/video/${encodeURIComponent(prompt)}?${params}`;
    const token = getApiToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const response = await fetch(url, { headers });
    if (!response.ok) throw await parseApiError(response);

    const blob = await response.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () =>
            resolve({ url: reader.result, prompt, model, seed });
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

// Generate speech/audio — GET /audio/{text}?voice=...
export const generateAudio = async (text, options = {}) => {
    const { voice = "nova", model = "openai-audio" } = options;

    const params = new URLSearchParams({ voice, model });
    const url = `${BASE_URL}/audio/${encodeURIComponent(text)}?${params}`;
    const token = getApiToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const response = await fetch(url, { headers });
    if (!response.ok) throw await parseApiError(response);

    const blob = await response.blob();
    const mimeType = blob.type || "audio/mpeg";
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () =>
            resolve({ url: reader.result, text, voice, model, mimeType });
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};
