// src/index.ts

// Enable debug logging before any other imports.
// Workers does not auto-populate process.env from [vars] at module scope,
// so we hardcode this. The env bridge middleware (in server.ts) syncs
// wrangler vars to process.env per-request for everything else.
process.env.DEBUG = "pollinations:*";

import app from "../server.js";

export default {
    fetch: app.fetch,
};
