import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./env";
import { textRoutes } from "./routes/text";

const app = new Hono<Env>();

// Generate request ID
app.use("*", async (c, next) => {
    c.set("requestId", crypto.randomUUID());
    await next();
});

// Global CORS
app.use(
    "*",
    cors({
        origin: "*",
        allowHeaders: ["authorization", "content-type"],
        allowMethods: ["GET", "POST", "OPTIONS"],
    })
);

// Routes
app.route("/", textRoutes);

// Health check
app.get("/health", (c) => c.json({ status: "ok" }));

export default app;
