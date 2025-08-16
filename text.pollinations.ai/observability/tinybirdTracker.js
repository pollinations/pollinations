// Tinybird telemetry tracking for text.pollinations.ai
// Sends events to Tinybird for analytics and monitoring

const TINYBIRD_BASE_URL = "https://api.tinybird.co/v0/events";

// Rate limiting configuration
const RATE_LIMIT_CONFIG = {
    windowMs: 60000, // 1 minute
    maxRequests: 100, // max requests per window
    skipSuccessfulGets: true
};

// Request rate limiter using Map to track requests per IP
const rateLimitMap = new Map();

function isRateLimited(ip) {
    const now = Date.now();
    const windowStart = now - RATE_LIMIT_CONFIG.windowMs;
    
    if (!rateLimitMap.has(ip)) {
        rateLimitMap.set(ip, []);
    }
    
    const requests = rateLimitMap.get(ip);
    // Remove old requests outside the window
    const validRequests = requests.filter(timestamp => timestamp > windowStart);
    rateLimitMap.set(ip, validRequests);
    
    return validRequests.length >= RATE_LIMIT_CONFIG.maxRequests;
}

function recordRequest(ip) {
    const now = Date.now();
    if (!rateLimitMap.has(ip)) {
        rateLimitMap.set(ip, []);
    }
    rateLimitMap.get(ip).push(now);
}

// Generate a unique ID for tracking
function generatePollinationsId() {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
}

// Send data to Tinybird with retry logic
async function sendToTinybird(datasource, data, controller = null, eventType = "event") {
    const maxRetries = 3;
    const baseDelay = 1000; // 1 second
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(`${TINYBIRD_BASE_URL}?name=${datasource}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.TINYBIRD_TOKEN}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
                signal: controller?.signal
            });
            
            if (response.ok) {
                console.log(`✅ ${eventType} sent to Tinybird ${datasource}:`, data.id || 'no-id');
                return true;
            } else {
                const errorText = await response.text();
                console.warn(`⚠️ Tinybird ${datasource} ${eventType} failed (attempt ${attempt}):`, response.status, errorText);
                
                if (response.status === 429) {
                    // Rate limited, wait longer
                    const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
                
                if (attempt === maxRetries) {
                    return false;
                }
            }
        } catch (error) {
            console.error(`❌ Tinybird ${datasource} ${eventType} error (attempt ${attempt}):`, error.message);
            
            if (attempt === maxRetries) {
                return false;
            }
            
            // Exponential backoff with jitter
            const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    return false;
}

// Main telemetry function
async function sendTelemetry(tinybirdEvent, request, response, controller = null) {
    try {
        // Rate limiting check
        const clientIP = request.headers.get('cf-connecting-ip') || 
                        request.headers.get('x-forwarded-for') || 
                        'unknown';
        
        if (isRateLimited(clientIP)) {
            console.log(`🚫 Rate limited telemetry for IP: ${clientIP}`);
            return;
        }
        
        recordRequest(clientIP);
        
        // Prepare base event data
        const baseEventData = {
            id: tinybirdEvent.id || generatePollinationsId(),
            timestamp: tinybirdEvent.timestamp || new Date().toISOString(),
            cf_ray: request.headers.get('cf-ray') || null,
            user_agent: request.headers.get('user-agent') || null,
            referer: request.headers.get('referer') || null,
            ip: clientIP,
            model: tinybirdEvent.model || null,
            provider: tinybirdEvent.provider || null,
            input_tokens: tinybirdEvent.input_tokens || 0,
            output_tokens: tinybirdEvent.output_tokens || 0,
            total_tokens: tinybirdEvent.total_tokens || 0,
            duration_ms: tinybirdEvent.duration_ms || 0,
            status_code: response?.status || 200,
            error_message: tinybirdEvent.error_message || null,
            user_id: tinybirdEvent.user_id || null,
            api_key_hash: tinybirdEvent.api_key_hash || null,
            tier: tinybirdEvent.tier || 'anonymous',
            stream: tinybirdEvent.stream || false,
            cache_hit: tinybirdEvent.cache_hit || false,
            queue_time_ms: tinybirdEvent.queue_time_ms || 0,
            processing_time_ms: tinybirdEvent.processing_time_ms || 0
        };
        
        // Send main event
        const eventSuccess = await sendToTinybird(
            "text_events", 
            baseEventData, 
            controller, 
            "main telemetry"
        );
        
        // Send moderation data if present
        if (tinybirdEvent.moderation_results) {
            const cfr = tinybirdEvent.moderation_results.choices?.[0]?.content_filter_results;
            if (cfr) {
                const moderationSuccess = await sendToTinybird(
                    "text_moderation",
                    {
                        id: tinybirdEvent.id ?? generatePollinationsId(),
                        timestamp: tinybirdEvent.timestamp,
                        ...cfr,
                    },
                    controller,
                    "moderation telemetry"
                );
                
                if (!moderationSuccess) {
                    console.warn("⚠️ Failed to send moderation telemetry");
                }
            }
        }
        
        // Send error data if present
        if (tinybirdEvent.error_details) {
            const errorSuccess = await sendToTinybird(
                "text_errors",
                {
                    id: tinybirdEvent.id || generatePollinationsId(),
                    timestamp: tinybirdEvent.timestamp || new Date().toISOString(),
                    cf_ray: baseEventData.cf_ray,
                    error_type: tinybirdEvent.error_details.type || 'unknown',
                    error_message: tinybirdEvent.error_details.message || null,
                    error_stack: tinybirdEvent.error_details.stack || null,
                    model: baseEventData.model,
                    provider: baseEventData.provider,
                    user_id: baseEventData.user_id,
                    status_code: baseEventData.status_code
                },
                controller,
                "error telemetry"
            );
            
            if (!errorSuccess) {
                console.warn("⚠️ Failed to send error telemetry");
            }
        }
        
        if (!eventSuccess) {
            console.warn("⚠️ Failed to send main telemetry event");
        }
        
    } catch (error) {
        console.error("❌ Telemetry error:", error);
    }
}

// Export functions
export {
    sendTelemetry,
    sendToTinybird,
    generatePollinationsId,
    isRateLimited,
    recordRequest
};
