import { cors } from "hono/cors";

// Dashboard identity OAuth uses top-level navigation and server-to-server
// exchanges. No cross-origin access to Enter's session cookie is needed.
export const apiCors = cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: [],
    exposeHeaders: ["Content-Length", "Content-Disposition"],
    maxAge: 600,
});
