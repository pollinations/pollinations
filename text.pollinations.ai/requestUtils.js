import debug from 'debug';

const log = debug('pollinations:requestUtils');

// List of whitelisted domains
const WHITELISTED_DOMAINS = [
    'pollinations',
    'thot',
    'ai-ministries.com',
    'localhost',
    'pollinations.github.io',
    '127.0.0.1',
    'nima'
];

/**
 * Helper function to get referrer from request
 * @param {object} req - Express request object
 * @param {object} data - Request data
 * @returns {string} - Referrer string
 */
export function getReferrer(req, data) {
    const referer = req.headers.referer || req.headers.referrer || data.referrer || req.headers['http-referer'] || 'unknown';
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
    const model = data.model || 'openai';
    const systemPrompt = data.system ? data.system : null;
    const temperature = data.temperature ? parseFloat(data.temperature) : undefined;
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

    const messages = data.messages || [{ role: 'user', content: req.params[0] }];
    if (systemPrompt) {
        messages.unshift({ role: 'system', content: systemPrompt });
    }

    return {
        messages,
        jsonMode,
        seed,
        model,
        temperature,
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
        reasoning_effort
    };
}
