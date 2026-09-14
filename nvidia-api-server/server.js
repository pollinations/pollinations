// @bun
// server.ts
import { readFileSync } from "fs";

var PORT = Number(process.env.PORT || 8080);
var NVIDIA_BASE_URL = (
    process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1"
).replace(/\/$/, "");
var MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES || 2000000);
var MAX_RATE_LIMIT_WAIT_MS = Number(
    process.env.MAX_RATE_LIMIT_WAIT_MS || 180000,
);
var DEFAULT_COOLDOWN_MS = Number(process.env.DEFAULT_COOLDOWN_MS || 30000);
var keyCooldowns = new Map();
var pageStyles = `:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;background:#071018;color:#edf4f8}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 10% 0%,#163247 0,#071018 42%);min-height:100vh}main{max-width:1060px;margin:auto;padding:28px 22px 80px}nav{display:flex;justify-content:space-between;align-items:center;margin-bottom:90px}nav a{color:#edf4f8;text-decoration:none;margin-left:20px;font-size:14px}nav>a{font-weight:750;letter-spacing:.02em;margin-left:0}.hero{max-width:760px;margin-bottom:38px}.eyebrow{color:#70d9c1;text-transform:uppercase;letter-spacing:.16em;font-size:11px;font-weight:750}.hero h1{font-size:clamp(40px,7vw,76px);line-height:.98;letter-spacing:-.055em;margin:14px 0 22px}.lead{font-size:19px;line-height:1.6;color:#b9c7d1;max-width:700px}.button{display:inline-block;border:0;border-radius:10px;background:#70d9c1;color:#071018;padding:12px 17px;font-weight:750;text-decoration:none;cursor:pointer}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:28px 0}.card,.grid article{border:1px solid #263745;background:rgba(13,24,34,.78);border-radius:16px;padding:24px;box-shadow:0 16px 60px #0002}.card{margin:18px 0}.card h2{margin:0 0 18px;font-size:21px}.endpoint{border-top:1px solid #263745;padding:16px 0}.endpoint p{color:#aab9c4;line-height:1.5;margin:8px 0 0}pre{white-space:pre-wrap;overflow:auto;border-radius:10px;background:#09121a;padding:16px;color:#c8f5e8;line-height:1.55;font-size:13px}code{color:#a9eddc}.model-toolbar{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:14px}.model-toolbar .button{font-size:13px;padding:9px 12px}.model-list{display:grid;gap:10px}.model-row{display:flex;justify-content:space-between;align-items:center;gap:16px;border:1px solid #263745;border-radius:10px;background:#09121a;padding:13px 15px}.model-row strong{font-size:14px;overflow-wrap:anywhere}.model-meta{color:#91a4b2;font-size:12px;text-align:right;white-space:nowrap}.model-state{color:#aab9c4;line-height:1.5;font-size:14px}@media(max-width:760px){.grid{grid-template-columns:1fr}nav{margin-bottom:55px}.model-row{align-items:flex-start;flex-direction:column;gap:6px}.model-meta{text-align:left}}`;
var nextKeyIndex = 0;
var corsHeaders = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
};
function json(data, status = 200, headers = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "content-type": "application/json; charset=utf-8",
            ...corsHeaders,
            ...headers,
        },
    });
}
function error(
    message,
    status = 400,
    type = "invalid_request_error",
    extra = {},
) {
    return json({ error: { message, type, ...extra } }, status);
}
function secretValue(name) {
    const envValue = process.env[name];
    if (envValue) return envValue;
    try {
        const content = readFileSync("/root/.zo_secrets", "utf-8");
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const pattern = new RegExp(
            `^export\\s+${escaped}=(?:"([^"\\]*(?:\\.[^"\\]*)*)"|'([^']*)'|([^\\s#]+))`,
            "m",
        );
        const match = content.match(pattern);
        return match?.[1] ?? match?.[2] ?? match?.[3];
    } catch {
        return;
    }
}
function nvidiaKeys() {
    const numbered = [
        secretValue("NVIDIA_API_KEY_1"),
        secretValue("NVIDIA_API_KEY_2"),
    ].filter((value) => Boolean(value));
    if (numbered.length > 0) return [...new Set(numbered)];
    const legacy = secretValue("NVIDIA_API_KEY");
    return legacy ? [legacy] : [];
}
function parseRetryDelay(response) {
    const retryAfter = response.headers.get("retry-after");
    if (retryAfter) {
        const seconds = Number(retryAfter);
        if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
        const date = Date.parse(retryAfter);
        if (Number.isFinite(date)) return Math.max(0, date - Date.now());
    }
    for (const name of [
        "x-ratelimit-reset-requests",
        "x-ratelimit-reset-tokens",
        "x-ratelimit-reset",
    ]) {
        const value = Number(response.headers.get(name));
        if (!Number.isFinite(value)) continue;
        if (value > 1000000000000) return Math.max(0, value - Date.now());
        if (value > 1e9) return Math.max(0, value * 1000 - Date.now());
        return Math.max(0, value * 1000);
    }
    return DEFAULT_COOLDOWN_MS;
}
function chooseAvailableKey(keys) {
    const now = Date.now();
    for (let offset = 0; offset < keys.length; offset += 1) {
        const index = (nextKeyIndex + offset) % keys.length;
        const key = keys[index];
        if ((keyCooldowns.get(key) || 0) <= now) {
            nextKeyIndex = (index + 1) % keys.length;
            return key;
        }
    }
    return null;
}
async function acquireKey(deadline) {
    while (true) {
        const keys = nvidiaKeys();
        const key = chooseAvailableKey(keys);
        if (key)
            return {
                key,
                waitedMs: Math.max(
                    0,
                    MAX_RATE_LIMIT_WAIT_MS - (deadline - Date.now()),
                ),
            };
        const retryAt = Math.min(
            ...keys.map((value) => keyCooldowns.get(value) || Date.now()),
        );
        const waitMs = Math.max(0, retryAt - Date.now());
        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0 || waitMs > remainingMs) return null;
        await Bun.sleep(waitMs);
    }
}
function markRateLimited(key, response) {
    keyCooldowns.set(key, Date.now() + parseRetryDelay(response));
}
function upstreamHeaders(key) {
    return {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        accept: "application/json",
    };
}
function upstreamResponse(response) {
    const headers = new Headers(corsHeaders);
    const contentType = response.headers.get("content-type");
    if (contentType) headers.set("content-type", contentType);
    const retryAfter = response.headers.get("retry-after");
    if (retryAfter) headers.set("retry-after", retryAfter);
    headers.set("cache-control", "no-store");
    return new Response(response.body, { status: response.status, headers });
}
async function proxy(request, pathname) {
    if (nvidiaKeys().length === 0)
        return error(
            "NVIDIA_API_KEY_1 or NVIDIA_API_KEY_2 is not configured on the server.",
            503,
            "configuration_error",
        );
    let body;
    if (request.method !== "GET" && request.method !== "HEAD") {
        try {
            body = await request.text();
        } catch {
            return error("Unable to read request body.");
        }
        if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES)
            return error("Request body is too large.", 413);
    }
    const deadline = Date.now() + MAX_RATE_LIMIT_WAIT_MS;
    let rateLimitAttempts = 0;
    while (true) {
        const acquired = await acquireKey(deadline);
        if (!acquired) {
            const remainingCooldowns = nvidiaKeys().map((key) =>
                Math.max(0, (keyCooldowns.get(key) || 0) - Date.now()),
            );
            const retryAfterSeconds = Math.ceil(
                (Math.min(...remainingCooldowns, MAX_RATE_LIMIT_WAIT_MS) ||
                    MAX_RATE_LIMIT_WAIT_MS) / 1000,
            );
            return error(
                "All configured NVIDIA keys are rate limited and the next available key is beyond the maximum wait window.",
                429,
                "rate_limit_error",
                {
                    retry_after_seconds: retryAfterSeconds,
                    max_wait_seconds: Math.ceil(MAX_RATE_LIMIT_WAIT_MS / 1000),
                },
            );
        }
        let upstream;
        try {
            upstream = await fetch(`${NVIDIA_BASE_URL}${pathname}`, {
                method: request.method,
                headers: upstreamHeaders(acquired.key),
                body,
            });
        } catch (cause) {
            console.error("NVIDIA request failed", cause);
            return error("Unable to reach NVIDIA API.", 502, "upstream_error");
        }
        if (upstream.status !== 429) return upstreamResponse(upstream);
        markRateLimited(acquired.key, upstream);
        rateLimitAttempts += 1;
        if (Date.now() >= deadline) {
            return error(
                "All configured NVIDIA keys are rate limited and the maximum wait window has elapsed.",
                429,
                "rate_limit_error",
                {
                    retry_after_seconds: Math.ceil(
                        MAX_RATE_LIMIT_WAIT_MS / 1000,
                    ),
                    attempts: rateLimitAttempts,
                },
            );
        }
    }
}
function docsPage() {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NVIDIA API Server Docs</title><style>${pageStyles}</style></head><body><main><nav><a href="/">NVIDIA API</a><span><a href="/docs">Docs</a><a href="#models">Models</a><a href="https://nvidia-api-server-marcusmok.zocomputer.io/playground">Playground</a></span></nav><section class="hero"><p class="eyebrow">OpenAI-compatible gateway</p><h1>NVIDIA models, one stable API.</h1><p class="lead">A Zo-hosted proxy for NVIDIA NIM. It keeps your NVIDIA credentials server-side, rotates between two keys, and waits for the next available key when NVIDIA rate-limits a request.</p><a class="button" href="https://nvidia-api-server-marcusmok.zocomputer.io/playground">Open playground →</a></section><section class="grid"><article><p class="eyebrow">Base URL</p><pre>http://localhost:56594</pre></article><article><p class="eyebrow">Authentication</p><p>No client API key is required. The proxy keeps the NVIDIA credentials server-side and injects them only into upstream requests.</p></article></section><section class="card" id="models"><div class="model-toolbar"><div><h2>Available models</h2><p class="hint">Fetched live from NVIDIA through <code>/v1/models</code>.</p></div><button class="button" id="refresh-models" type="button">Refresh</button></div><div class="model-list" id="model-list"><p class="model-state">Loading models from NVIDIA…</p></div></section><section class="card"><h2>Endpoints</h2><div class="endpoint"><strong>GET /health</strong><p>Returns service status and the number of configured upstream keys.</p></div><div class="endpoint"><strong>GET /v1/models</strong><p>Lists models from NVIDIA NIM.</p></div><div class="endpoint"><strong>POST /v1/chat/completions</strong><p>Accepts OpenAI-compatible chat completion requests, including <code>stream: true</code>.</p></div><div class="endpoint"><strong>GET /api/nvidia/health</strong><p>Nova Cloud Computer compatibility wrapper.</p></div><div class="endpoint"><strong>GET /api/nvidia/models</strong><p>Nova Cloud Computer compatibility wrapper.</p></div><div class="endpoint"><strong>POST /api/nvidia/chat</strong><p>Nova Cloud Computer compatibility wrapper.</p></div></section><section class="card"><h2>Example</h2><pre>curl http://localhost:56594/api/nvidia/chat \\\n  -H "Content-Type: application/json" \\\n  -d '{
    "model": "nvidia/llama-3.3-nemotron-super-49b-v1.5",
    "messages": [{"role": "user", "content": "Hello"}],
    "max_tokens": 128
  }'</pre></section><section class="card"><h2>Key rotation</h2><p>Configure <code>NVIDIA_API_KEY_1</code> and <code>NVIDIA_API_KEY_2</code> as Zo secrets. Requests use an available key and switch to the other after a 429. When both keys are cooling down, the server waits until the shorter cooldown expires. It waits up to 180 seconds by default, then returns HTTP 429 with JSON fields <code>retry_after_seconds</code> and <code>max_wait_seconds</code>.</p></section></main><script>const modelList=document.getElementById("model-list");const refreshModels=document.getElementById("refresh-models");async function loadModelList(){refreshModels.disabled=true;modelList.innerHTML="<p class="model-state">Loading models from NVIDIA…</p>";try{const response=await fetch("/v1/models");const data=await response.json();if(!response.ok)throw new Error(data.error?.message||"Unable to load models");const models=Array.isArray(data.data)?data.data:[];if(models.length===0){modelList.innerHTML="<p class="model-state">NVIDIA returned no models.</p>";return}modelList.replaceChildren(...models.map((model)=>{const row=document.createElement("div");row.className="model-row";const name=document.createElement("strong");name.textContent=model.id||"Unnamed model";const meta=document.createElement("span");meta.className="model-meta";meta.textContent=model.owned_by||"NVIDIA NIM";row.append(name,meta);return row}))}catch(error){modelList.innerHTML="";const state=document.createElement("p");state.className="model-state";state.textContent=error instanceof Error?error.message:"Unable to load models.";modelList.append(state)}finally{refreshModels.disabled=false}}refreshModels.addEventListener("click",loadModelList);loadModelList();</script></body></html>`;
}
function playgroundPage() {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NVIDIA API Playground</title><style>${pageStyles}.playground{display:grid;grid-template-columns:1fr 1fr;gap:20px}.field{display:grid;gap:8px;margin-bottom:16px}label{font-size:13px;color:#a4b0bd}input,select,textarea{width:100%;box-sizing:border-box;border:1px solid #2d3a47;border-radius:10px;background:#0d151d;color:#eef4f8;padding:12px;font:inherit}textarea{min-height:150px;resize:vertical}.actions{display:flex;gap:10px;align-items:center}.status{color:#8fd3a8;font-size:13px}.output{min-height:330px;white-space:pre-wrap;overflow:auto}.hint{font-size:13px;color:#a4b0bd}@media(max-width:760px){.playground{grid-template-columns:1fr}}</style></head><body><main><nav><a href="/">NVIDIA API</a><span><a href="/docs">Docs</a><a href="https://nvidia-api-server-marcusmok.zocomputer.io/playground">Playground</a></span></nav><section class="hero"><p class="eyebrow">Live request console</p><h1>Try an NVIDIA model.</h1><p class="lead">Requests go through the deployed Zo proxy. No client API key is required; choose a live NVIDIA model and send a request.</p></section><section class="playground"><div class="card"><div class="field"><label for="model">Model</label><select id="model"><option value="nvidia/llama-3.3-nemotron-super-49b-v1.5">nvidia/llama-3.3-nemotron-super-49b-v1.5</option></select></div><div class="field"><label for="prompt">Prompt</label><textarea id="prompt">Explain why NVIDIA API key rotation is useful in one sentence.</textarea></div><div class="actions"><button class="button" id="send">Send request</button><span class="status" id="status"></span></div><p class="hint">The proxy automatically retries a rate-limited request with the other configured NVIDIA key.</p></div><div class="card"><h2>Response</h2><pre class="output" id="output">Loading models…</pre></div></section></main><script>const modelInput=document.getElementById('model');const promptInput=document.getElementById('prompt');const output=document.getElementById('output');const status=document.getElementById('status');const headers=()=>({});async function loadModels(){try{const response=await fetch('/v1/models',{headers:headers()});const data=await response.json();if(!response.ok)throw new Error(data.error?.message||'Unable to load models');modelInput.innerHTML='';for(const item of data.data||[]){const option=document.createElement('option');option.value=item.id;option.textContent=item.id;modelInput.appendChild(option)}output.textContent='Ready.'}catch(error){output.textContent=error.message}}document.getElementById('send').addEventListener('click',async()=>{status.textContent='Sending…';output.textContent='';try{const response=await fetch('/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',...headers()},body:JSON.stringify({model:modelInput.value,messages:[{role:'user',content:promptInput.value}],max_tokens:256})});const data=await response.json();if(!response.ok)throw new Error(JSON.stringify(data,null,2));output.textContent=data.choices?.[0]?.message?.content||JSON.stringify(data,null,2);status.textContent='Done';}catch(error){output.textContent=error.message;status.textContent='Failed'}});loadModels();</script></body></html>`;
}
async function handler(request) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS")
        return new Response(null, { status: 204, headers: corsHeaders });
    if (url.pathname === "/health" || url.pathname === "/healthz") {
        return json({
            status: "ok",
            service: "nvidia-api-server",
            upstream: NVIDIA_BASE_URL,
            configured_keys: nvidiaKeys().length,
            max_rate_limit_wait_seconds: Math.ceil(
                MAX_RATE_LIMIT_WAIT_MS / 1000,
            ),
        });
    }
    // Nova Cloud Computer compatibility endpoints
    if (url.pathname === "/api/nvidia/health" && request.method === "GET") {
        return json({
            status: "ok",
            provider: "nvidia-nim",
            providerConfigured: nvidiaKeys().length > 0,
        });
    }
    if (url.pathname === "/api/nvidia/models" && request.method === "GET") {
        return proxy(request, "/models");
    }
    if (url.pathname === "/api/nvidia/chat" && request.method === "POST") {
        return proxy(request, "/chat/completions");
    }
    if (url.pathname === "/" && request.method === "GET")
        return new Response(docsPage(), {
            headers: {
                "content-type": "text/html; charset=utf-8",
                ...corsHeaders,
            },
        });
    if (url.pathname === "/docs" && request.method === "GET")
        return new Response(docsPage(), {
            headers: {
                "content-type": "text/html; charset=utf-8",
                ...corsHeaders,
            },
        });
    if (url.pathname === "/playground" || url.pathname === "/playground/")
        return new Response(playgroundPage(), {
            headers: {
                "content-type": "text/html; charset=utf-8",
                ...corsHeaders,
            },
        });
    if (url.pathname === "/v1/models" && request.method === "GET")
        return proxy(request, "/models");
    if (url.pathname === "/v1/chat/completions" && request.method === "POST")
        return proxy(request, "/chat/completions");
    if (url.pathname === "/models" && request.method === "GET")
        return proxy(request, "/models");
    if (url.pathname === "/chat/completions" && request.method === "POST")
        return proxy(request, "/chat/completions");
    return error("Route not found.", 404, "not_found");
}
console.log(`nvidia-api-server listening on ${PORT}`);
Bun.serve({ port: PORT, fetch: handler });
