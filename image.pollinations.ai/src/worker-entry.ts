// Worker entrypoint for Cloudflare Workers deployment.
// Workers does not auto-populate process.env from [vars] at module scope,
// so we hardcode DEBUG here. The env bridge middleware (in index.ts) syncs
// wrangler vars to process.env per-request for everything else.
process.env.DEBUG = "pollinations:*";

import app from "./index.js";

export default {
    fetch: app.fetch,
};
