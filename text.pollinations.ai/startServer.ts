import debug from "debug";
import { serve } from "@hono/node-server";
import app from "./server.js";

const log = debug("pollinations:startup");

const port = parseInt(process.env.PORT || "16385", 10);

serve(
    {
        fetch: app.fetch,
        port,
    },
    (info) => {
        log("Server is running on port %d", info.port);

        // Validate PLN_ENTER_TOKEN configuration
        if (!process.env.PLN_ENTER_TOKEN) {
            log(
                "⚠️  PLN_ENTER_TOKEN not set - enter.pollinations.ai bypass disabled",
            );
        }
    },
);
