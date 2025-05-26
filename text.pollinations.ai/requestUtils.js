import debug from 'debug';

const log = debug('pollinations:requestUtils');


// Read whitelisted domains from environment variable
export const WHITELISTED_DOMAINS = process.env.WHITELISTED_DOMAINS 
    ? process.env.WHITELISTED_DOMAINS.split(',').map(domain => domain.trim())
    : [];


/**
 * Helper function to get referrer from request
 * @param {object} req - Express request object
 * @param {object} data - Request data
 * @returns {string} - Referrer string
 */
export function getReferrer(req, data) {
    const referer = req.headers.referer || req.headers.referrer || req.headers.origin || data.referrer || data.origin || req.headers['http-referer'] || 'unknown';
    return referer;
}

/**
 * Common function to handle request data
 * @param {object} req - Express request object
 * @returns {object} - Processed request data
 */
export function getRequestData(req) {
    const query = req.query || {};
    const body = req.body || {};
    const data = { ...query, ...body };

    const jsonMode = data.jsonMode || 
                    (typeof data.json === 'string' && data.json.toLowerCase() === 'true') ||
                    (typeof data.json === 'boolean' && data.json === true) ||
                    data.response_format?.type === 'json_object';
                    
    const seed = data.seed ? parseInt(data.seed, 10) : null;
    let model = data.model || 'openai';
    const systemPrompt = data.system ? data.system : null;
    const temperature = data.temperature ? parseFloat(data.temperature) : undefined;
    const top_p = data.top_p ? parseFloat(data.top_p) : undefined;
    const presence_penalty = data.presence_penalty ? parseFloat(data.presence_penalty) : undefined;
    const frequency_penalty = data.frequency_penalty ? parseFloat(data.frequency_penalty) : undefined;
    const isPrivate = req.path?.startsWith('/openai') ? true :
                     data.private === true || 
                     (typeof data.private === 'string' && data.private.toLowerCase() === 'true');

    const referrer = getReferrer(req, data);
    const isImagePollinationsReferrer = WHITELISTED_DOMAINS.some(domain => referrer.toLowerCase().includes(domain));
    const isRobloxReferrer = referrer.toLowerCase().includes('roblox') || referrer.toLowerCase().includes('gacha11211');
    const stream = data.stream || false; 
    
    // Extract voice parameter for audio models
    const voice = data.voice || "alloy";

    // Extract audio parameters
    const modalities = data.modalities;
    const audio = data.audio;

    // Extract tools and tool_choice for function calling
    const tools = data.tools || undefined;
    const tool_choice = data.tool_choice || undefined;
    
    // Extract reasoning_effort parameter for o3-mini model
    const reasoning_effort = data.reasoning_effort || undefined;

    // Preserve the original response_format object if it exists
    const response_format = data.response_format || undefined;

    const messages = data.messages || [{ role: 'user', content: req.params[0] }];
    if (systemPrompt) {
        messages.unshift({ role: 'system', content: systemPrompt });
    }

    if (isRobloxReferrer) {
        log('Roblox referrer detected:', referrer);
        model="llamascout"
    }

    return {
        messages,
        jsonMode,
        seed,
        model,
        temperature,
        top_p,
        presence_penalty,
        frequency_penalty,
        isImagePollinationsReferrer,
        isRobloxReferrer,
        referrer,
        stream,
        isPrivate,
        voice,
        tools,
        tool_choice,
        modalities,
        audio,
        reasoning_effort,
        response_format
    };
}
// Function to check if delay should be bypassed
export function shouldBypassDelay(req) {
    const referrer = getReferrer(req, req.body || {});
    return WHITELISTED_DOMAINS.some(domain => referrer.toLowerCase().includes(domain));
}
