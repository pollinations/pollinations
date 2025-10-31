/**
 * Cloudflare Workers backend for uptime monitoring
 * 
 * This worker provides uptime monitoring for Pollinations AI models.
 * Data is stored in Cloudflare KV for persistence across requests.
 * 
 * Required KV Namespace: UPTIME_DATA
 * 
 * Scheduled worker runs every 5 minutes to check model uptime
 */

// KV namespace is bound as UPTIME_DATA in wrangler.toml

// Validate model name to prevent prototype pollution
function validateModelName(name) {
    if (!name || typeof name !== 'string') return false;
    if (['__proto__', 'constructor', 'prototype'].includes(name)) return false;
    return true;
}

// Calculate uptime percentage
function calculateUptimePercentage(history) {
    if (!history || history.length === 0) return null;
    const upCount = history.filter(h => h.status === 'up').length;
    return Math.round((upCount / history.length) * 100);
}

// Fetch models from Pollinations APIs
async function fetchModels() {
    try {
        const [textResponse, imageResponse] = await Promise.all([
            fetch('https://text.pollinations.ai/models'),
            fetch('https://image.pollinations.ai/about')
        ]);
        
        const textModels = await textResponse.json();
        const imageModels = await imageResponse.json();
        
        return { textModels, imageModels };
    } catch (error) {
        console.error('Error fetching models:', error);
        return { textModels: [], imageModels: [] };
    }
}

// Check model uptime and record result
async function checkAndRecordModel(env, modelName, type) {
    let isUp = false;
    
    try {
        if (type === 'text') {
            const response = await fetch('https://text.pollinations.ai/models', {
                signal: AbortSignal.timeout(5000)
            });
            if (response.ok) {
                const models = await response.json();
                isUp = models.some(m => m.name === modelName);
            }
        } else if (type === 'image') {
            const response = await fetch(
                `https://image.pollinations.ai/prompt/test?model=${modelName}&width=64&height=64&nologo=true`,
                { 
                    method: 'HEAD',
                    signal: AbortSignal.timeout(5000)
                }
            );
            isUp = response.ok;
        }
    } catch (error) {
        console.error(`Check failed for ${modelName}:`, error.message);
        isUp = false;
    }
    
    // Get existing data
    const existingData = await env.UPTIME_DATA.get(modelName, { type: 'json' }) || {
        history: [],
        lastCheck: null,
        currentStatus: 'unknown',
        type
    };
    
    // Add new entry
    const timestamp = Date.now();
    existingData.history.push({
        timestamp,
        status: isUp ? 'up' : 'down'
    });
    
    // Keep only last 288 entries (24 hours at 5-min intervals)
    if (existingData.history.length > 288) {
        existingData.history = existingData.history.slice(-288);
    }
    
    existingData.lastCheck = timestamp;
    existingData.currentStatus = isUp ? 'online' : 'offline';
    existingData.type = type;
    
    // Store updated data
    await env.UPTIME_DATA.put(modelName, JSON.stringify(existingData));
    
    return isUp;
}

// Scheduled event handler - runs every 5 minutes
export default {
    async scheduled(event, env, ctx) {
        console.log('Starting scheduled uptime check');
        
        const { textModels, imageModels } = await fetchModels();
        
        // Check all text models
        for (const model of textModels) {
            await checkAndRecordModel(env, model.name, 'text');
        }
        
        // Check all image models
        for (const model of imageModels) {
            await checkAndRecordModel(env, model.name, 'image');
        }
        
        console.log(`Checked ${textModels.length} text models and ${imageModels.length} image models`);
    },
    
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        
        // CORS headers
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        };
        
        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }
        
        // GET /api/uptime - Get all uptime data
        if (url.pathname === '/api/uptime' && request.method === 'GET') {
            const list = await env.UPTIME_DATA.list();
            const allData = {};
            
            for (const key of list.keys) {
                const data = await env.UPTIME_DATA.get(key.name, { type: 'json' });
                if (data) {
                    allData[key.name] = data;
                }
            }
            
            return new Response(JSON.stringify(allData), {
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json',
                }
            });
        }
        
        // GET /api/uptime/:modelName - Get specific model uptime
        if (url.pathname.startsWith('/api/uptime/') && request.method === 'GET') {
            const modelName = url.pathname.split('/api/uptime/')[1];
            
            if (!validateModelName(modelName)) {
                return new Response(JSON.stringify({ error: 'Invalid model name' }), {
                    status: 400,
                    headers: {
                        ...corsHeaders,
                        'Content-Type': 'application/json',
                    }
                });
            }
            
            const data = await env.UPTIME_DATA.get(modelName, { type: 'json' });
            
            if (!data) {
                return new Response(JSON.stringify({ error: 'Model not found' }), {
                    status: 404,
                    headers: {
                        ...corsHeaders,
                        'Content-Type': 'application/json',
                    }
                });
            }
            
            const result = {
                model: modelName,
                ...data,
                uptimePercentage: calculateUptimePercentage(data.history)
            };
            
            return new Response(JSON.stringify(result), {
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json',
                }
            });
        }
        
        // POST /api/uptime/:modelName - Record uptime check (for manual checks)
        if (url.pathname.startsWith('/api/uptime/') && request.method === 'POST') {
            const modelName = url.pathname.split('/api/uptime/')[1];
            
            if (!validateModelName(modelName)) {
                return new Response(JSON.stringify({ error: 'Invalid model name' }), {
                    status: 400,
                    headers: {
                        ...corsHeaders,
                        'Content-Type': 'application/json',
                    }
                });
            }
            
            const body = await request.json();
            const { isUp, type = 'text' } = body;
            
            if (typeof isUp !== 'boolean') {
                return new Response(JSON.stringify({ error: 'isUp must be a boolean' }), {
                    status: 400,
                    headers: {
                        ...corsHeaders,
                        'Content-Type': 'application/json',
                    }
                });
            }
            
            await checkAndRecordModel(env, modelName, type);
            
            return new Response(JSON.stringify({ 
                success: true, 
                model: modelName, 
                status: isUp ? 'up' : 'down' 
            }), {
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json',
                }
            });
        }
        
        // Default response
        return new Response('Uptime Monitor API - Use /api/uptime endpoints', {
            headers: corsHeaders
        });
    }
};
