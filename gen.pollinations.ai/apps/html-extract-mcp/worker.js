import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  createMCPResponse,
  createTextContent,
} from "../../packages/mcp/src/utils/coreUtils.js";

function readBearerToken(request) {
  const authorization = request.headers.get("authorization");
  if (!authorization) return null;
  const [scheme, token] = authorization.trim().split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }
  return token;
}

function unauthorizedResponse() {
  return Response.json(
    {
      error: "unauthorized",
      message: "Send a Pollinations API key as a bearer token.",
    },
    {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Bearer realm="html-extract-mcp.pollinations.ai"',
      },
    },
  );
}

function normalizeWhitespace(s) {
  return String(s ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeEntities(text) {
  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
  };

  return String(text ?? "").replace(/&(#x?[0-9A-Fa-f]+|[A-Za-z]+);/g, (m, v) => {
    const key = String(v);
    if (key[0] !== "#") {
      const mapped = named[key];
      return mapped ?? m;
    }

    const isHex = key.startsWith("#x") || key.startsWith("#X");
    const numStr = isHex ? key.slice(2) : key.slice(1);
    const codePoint = parseInt(numStr, isHex ? 16 : 10);
    if (!Number.isFinite(codePoint)) return m;
    try {
      return String.fromCodePoint(codePoint);
    } catch {
      return m;
    }
  });
}

function extractReadableTextFromHtml(html) {
  let s = String(html ?? "");

  // Remove scripts/styles/noscript
  s = s.replace(
    /<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi,
    " ",
  );

  // Remove comments
  s = s.replace(/<!--[\s\S]*?-->/g, " ");

  // Add line breaks before stripping tags
  s = s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|li|tr)\s*>/gi, "\n")
    .replace(/<\/(h1|h2|h3|h4|h5|h6)\s*>/gi, "\n");

  // Strip remaining tags
  s = s.replace(/<[^>]+>/g, " ");

  // Decode entities + normalize
  s = decodeEntities(s);
  return normalizeWhitespace(s);
}

function validateHttpUrl(url) {
  const u = new URL(url);
  const allowed = ["http:", "https:"].includes(u.protocol);
  if (!allowed) throw new Error("Only http/https URLs are allowed.");

  const host = u.hostname.toLowerCase();

  // Pattern-based SSRF guard (MVP, choice A)
  const blocked =
    host === "localhost" ||
    host.startsWith("127.") ||
    host.startsWith("0.") ||
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    host.startsWith("169.254.") ||
    (host.startsWith("172.") && /^(172\.(1[6-9]|2[0-9]|3[0-1]))\./.test(host));

  if (blocked) {
    throw new Error("That URL host looks like a private/internal address.");
  }

  if (u.username || u.password) {
    throw new Error("URLs with credentials are not allowed.");
  }

  return u.toString();
}

function buildServer() {
  const server = new McpServer(
    { name: "html-extract-mcp", title: "HTML Extract MCP", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.registerTool(
    "extract_url_text",
    {
      description:
        "Fetch a public URL containing HTML and return cleaned readable text.",
      inputSchema: z.object({
        url: z.string().url(),
        maxCharacters: z
          .number()
          .int()
          .min(200)
          .max(200000)
          .optional(),
      }),
    },
    async ({ url, maxCharacters }, context) => {
      const safeUrl = validateHttpUrl(url);

      const resp = await fetch(safeUrl, {
        method: "GET",
        headers: {
          "User-Agent": "html-extract-mcp",
          Accept: "text/html,application/xhtml+xml",
        },
        redirect: "follow",
      });

      if (!resp.ok) {
        throw new Error(`Fetch failed (HTTP ${resp.status}).`);
      }

      const ct = resp.headers.get("content-type") || "";
      const ctL = ct.toLowerCase();
      const looksHtml = ctL.includes("html") || ctL.startsWith("text/");
      if (!looksHtml) {
        throw new Error(`Not an HTML/text document (Content-Type: ${ct}).`);
      }

      const html = await resp.text();
      const text = extractReadableTextFromHtml(html);

      const lim = maxCharacters ?? 40000;
      const truncated = text.length > lim ? text.slice(0, lim).trimEnd() : text;

      return createMCPResponse([createTextContent(truncated)]);
    },
  );

  return server;
}

const mcpHandler = createMcpHandler(() => buildServer(), {
  legacy: "stateless",
  onerror: (error) => console.error(error),
});

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/health" && request.method === "GET") {
      return Response.json({
        name: "html-extract-mcp",
        transport: "streamable-http",
        endpoint: "/",
        stateless: true,
      });
    }

    if (url.pathname !== "/") {
      return new Response("Not found", { status: 404 });
    }

    const token = readBearerToken(request);
    if (!token) return unauthorizedResponse();

    // Reject JSON-RPC batches (match ask-jev-mcp behavior)
    if (
      request.method === "POST" &&
      Array.isArray(await request.clone().json().catch(() => null))
    ) {
      return Response.json(
        {
          error: "invalid_request",
          message: "Batch requests are not supported.",
        },
        { status: 400 },
      );
    }

    return mcpHandler.fetch(request, {
      authInfo: {
        token,
        clientId: "pollinations-api-key",
        scopes: [],
      },
    });
  },
};
