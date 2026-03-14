import http from "node:http";
import { parse } from "node:url";

const PORT = 16384;
const SANA_URL = process.env.SANA_URL || "http://localhost:19876";
const SANA_SECRET = process.env.SANA_SECRET || "legacy-proxy-2026";
const MAX_CONCURRENT = 5;
const MAX_QUEUED = 10;

let activeRequests = 0;
let queuedRequests = 0;

const server = http.createServer(async (req, res) => {
  const { pathname, query } = parse(req.url, true);

  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // /models endpoint
  if (pathname === "/models") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify([{ name: "sana", description: "SANA Sprint 0.6B fast image generation" }]));
    return;
  }

  // Health check
  if (pathname === "/" || pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "legacy-image-proxy", backend: "sana-sprint", active: activeRequests, queued: queuedRequests }));
    return;
  }

  // Only handle /prompt/{prompt}
  if (!pathname.startsWith("/prompt/")) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found", message: "Use /prompt/{your prompt}" }));
    return;
  }

  // Concurrency limit with queue
  if (activeRequests >= MAX_CONCURRENT) {
    if (queuedRequests >= MAX_QUEUED) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Server busy", message: "Too many concurrent requests" }));
      return;
    }
    // Wait for a slot
    queuedRequests++;
    await new Promise((resolve) => {
      const check = setInterval(() => {
        if (activeRequests < MAX_CONCURRENT) {
          clearInterval(check);
          resolve();
        }
      }, 100);
    });
    queuedRequests--;
  }

  const prompt = decodeURIComponent(pathname.slice("/prompt/".length));
  if (!prompt) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Missing prompt" }));
    return;
  }

  const width = parseInt(query.width) || 1024;
  const height = parseInt(query.height) || 1024;
  const seed = query.seed ? parseInt(query.seed) : undefined;

  console.log(`[proxy] ${req.url} -> SANA ${width}x${height} "${prompt.slice(0, 80)}" (active: ${activeRequests + 1}/${MAX_CONCURRENT})`);

  activeRequests++;
  try {
    const body = { prompts: [prompt], width, height };
    if (seed !== undefined) body.seed = seed;

    const upstream = await fetch(`${SANA_URL}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-sana-secret": SANA_SECRET },
      body: JSON.stringify(body),
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      console.error(`[proxy] sana error ${upstream.status}: ${text}`);
      res.writeHead(upstream.status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(text);
      return;
    }

    const result = await upstream.json();
    const imageData = result[0];

    if (!imageData?.image) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "No image in response" }));
      return;
    }

    // Decode base64 to binary JPEG
    const imageBuffer = Buffer.from(imageData.image, "base64");

    res.writeHead(200, {
      "Content-Type": "image/jpeg",
      "Content-Length": imageBuffer.length,
      "Access-Control-Allow-Origin": "*",
      "X-Seed": String(imageData.seed || ""),
      "X-Width": String(imageData.width || width),
      "X-Height": String(imageData.height || height),
      "X-Model": "sana-sprint",
    });
    res.end(imageBuffer);
  } catch (err) {
    console.error("[proxy] fetch error:", err.message);
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Upstream error", message: err.message }));
  } finally {
    activeRequests--;
  }
});

server.listen(PORT, () => {
  console.log(`Legacy image proxy listening on port ${PORT}`);
  console.log(`Proxying /prompt/{prompt} -> ${SANA_URL}/generate (max ${MAX_CONCURRENT} concurrent)`);
});
