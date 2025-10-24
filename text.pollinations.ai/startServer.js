import debug from "debug";
import app from "./server.js";

const log = debug("pollinations:startup");

const port = process.env.PORT || 16385;
const host = "0.0.0.0";

app.listen(port, host, () => {
    log("Server is running on port %d", port);
});
