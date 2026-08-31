import { createServer, type IncomingMessage } from "node:http";
import { readConfig } from "./config.js";
import { DiscordGateway } from "./discord.js";
import { HttpError, HumanService } from "./service.js";
import { ConversationStore } from "./store.js";

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const config = readConfig();
const store = new ConversationStore(config.databasePath);
const gateway = new DiscordGateway({
    token: config.discordToken,
    guildId: config.guildId,
    channelId: config.channelId,
    responderRoleId: config.responderRoleId,
});
await gateway.start();
const service = new HumanService({
    apiToken: config.apiToken,
    responseTimeoutMs: config.responseTimeoutMs,
    store,
    gateway,
});

const server = createServer(async (request, response) => {
    try {
        if (
            request.method !== "POST" ||
            request.url !== "/v1/chat/completions"
        ) {
            throw new HttpError(404, "Not found", "not_found");
        }
        service.authorize(request.headers.authorization);
        const result = await service.complete(await readJson(request));
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(result));
    } catch (error) {
        const status = error instanceof HttpError ? error.status : 500;
        if (!(error instanceof HttpError)) console.error(error);
        const message =
            error instanceof HttpError
                ? error.message
                : "Internal server error";
        const code = error instanceof HttpError ? error.code : "internal_error";
        response.writeHead(status, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: { message, type: code, code } }));
    }
});
server.requestTimeout = config.responseTimeoutMs + 10_000;
server.listen(config.port);

async function readJson(request: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > MAX_BODY_BYTES)
            throw new HttpError(413, "Request body is too large");
        chunks.push(buffer);
    }
    try {
        return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
        throw new HttpError(400, "Request body must be valid JSON");
    }
}
