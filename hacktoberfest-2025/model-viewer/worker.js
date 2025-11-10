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
    const timestamp = Date.now();
    const seed = Math.floor(timestamp / 1000); // Use timestamp-based seed to avoid caching
    
    try {
        if (type === 'text') {
            const response = await fetch('https://text.pollinations.ai/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [{ role: 'user', content: 'test' }],
                    model: modelName,
                    seed
                }),
                signal: AbortSignal.timeout(10000)
            });
            if (response.ok) {
                const text = await response.text();
                isUp = text && text.length > 0;
            }
        } else if (type === 'image') {
            const response = await fetch(
                `https://image.pollinations.ai/prompt/test?model=${modelName}&width=64&height=64&nologo=true&seed=${seed}`,
                { 
                    method: 'GET',
                    signal: AbortSignal.timeout(15000)
                }
            );
            if (response.ok) {
                const contentType = response.headers.get('content-type');
                isUp = contentType && contentType.startsWith('image/');
            }
        }
    } catch (error) {
        console.error(`Check failed for ${modelName}:`, error.message);
        isUp = false;
    }
    
    let existingData;
    try {
        existingData = await env.UPTIME_DATA.get(modelName, { type: 'json' }) || {
            history: [],
            lastCheck: null,
            currentStatus: 'unknown',
            type
        };
    } catch (error) {
        console.error(`KV read failed for ${modelName}:`, error.message);
        existingData = {
            history: [],
            lastCheck: null,
            currentStatus: 'unknown',
            type
        };
    }
    
    existingData.history.push({
        timestamp,
        status: isUp ? 'up' : 'down'
    });
    
    if (existingData.history.length > 288) {
        existingData.history = existingData.history.slice(-288);
    }
    
    existingData.lastCheck = timestamp;
    existingData.currentStatus = isUp ? 'online' : 'offline';
    existingData.type = type;
    
    try {
        await env.UPTIME_DATA.put(modelName, JSON.stringify(existingData));
    } catch (error) {
        console.error(`KV write failed for ${modelName}:`, error.message);
    }
    
    return isUp;
}

// Scheduled event handler - runs every 5 minutes
export default {
    async scheduled(event, env, ctx) {
        console.log('Starting scheduled uptime check');
        
        const { textModels, imageModels } = await fetchModels();
        
        await Promise.all([
            ...textModels.map(model => checkAndRecordModel(env, model.name, 'text')),
            ...imageModels.map(model => checkAndRecordModel(env, model.name, 'image'))
        ]);
        
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
            try {
                const list = await env.UPTIME_DATA.list();
                const allData = {};
                
                for (const key of list.keys) {
                    try {
                        const data = await env.UPTIME_DATA.get(key.name, { type: 'json' });
                        if (data) {
                            allData[key.name] = data;
                        }
                    } catch (error) {
                        console.error(`Failed to get data for ${key.name}:`, error.message);
                    }
                }
                
                return new Response(JSON.stringify(allData), {
                    headers: {
                        ...corsHeaders,
                        'Content-Type': 'application/json',
                    }
                });
            } catch (error) {
                console.error('Failed to list KV keys:', error.message);
                return new Response(JSON.stringify({ error: 'Failed to retrieve uptime data' }), {
                    status: 500,
                    headers: {
                        ...corsHeaders,
                        'Content-Type': 'application/json',
                    }
                });
            }
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
            
            try {
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
            } catch (error) {
                console.error(`Failed to get data for ${modelName}:`, error.message);
                return new Response(JSON.stringify({ error: 'Failed to retrieve model data' }), {
                    status: 500,
                    headers: {
                        ...corsHeaders,
                        'Content-Type': 'application/json',
                    }
                });
            }
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
