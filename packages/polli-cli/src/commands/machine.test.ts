import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let server: Server;
let machine: typeof import("./machine.js");
const requests: { url?: string; auth?: string; body: unknown }[] = [];
const previousEnv = {
    POLLINATIONS_BASE_URL: process.env.POLLINATIONS_BASE_URL,
    POLLINATIONS_API_KEY: process.env.POLLINATIONS_API_KEY,
};

beforeAll(async () => {
    server = createServer((request, response) => {
        let raw = "";
        request.on("data", (chunk) => {
            raw += chunk;
        });
        request.on("end", () => {
            const body = raw ? JSON.parse(raw) : null;
            requests.push({
                url: request.url,
                auth: request.headers.authorization,
                body,
            });
            response.writeHead(200, { "Content-Type": "application/json" });
            response.end(
                JSON.stringify(
                    request.url === "/account/keys"
                        ? { key: "sk_machine" }
                        : { name: body.name, state: "running" },
                ),
            );
        });
    });
    await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
        throw new Error("No test port");
    process.env.POLLINATIONS_BASE_URL = `http://127.0.0.1:${address.port}`;
    process.env.POLLINATIONS_API_KEY = "sk_account";
    machine = await import("./machine.js");
});

afterAll(async () => {
    for (const [name, value] of Object.entries(previousEnv)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
    }
    await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
    );
});

describe("parseEnv", () => {
    it("splits on the first equals sign", () => {
        expect(
            machine.parseEnv(["A=1", "URL=https://x.test/?a=b", "EMPTY="]),
        ).toEqual({
            A: "1",
            URL: "https://x.test/?a=b",
            EMPTY: "",
        });
    });

    it("rejects pairs without a key", () => {
        expect(() => machine.parseEnv(["novalue"])).toThrow("KEY=value");
        expect(() => machine.parseEnv(["=x"])).toThrow("KEY=value");
    });
});

describe("machine create --mint-key", () => {
    it("mints a key that can create keys and passes it to the machine", async () => {
        await machine.machineCommand.parseAsync(
            ["create", "box", "--image", "node:22", "--mint-key"],
            { from: "user" },
        );

        expect(requests).toEqual([
            {
                url: "/account/keys",
                auth: "Bearer sk_account",
                body: {
                    name: "polli-machine-box",
                    type: "secret",
                    accountPermissions: ["keys"],
                },
            },
            {
                url: "/machines",
                auth: "Bearer sk_account",
                body: {
                    name: "box",
                    image: "node:22",
                    env: { POLLINATIONS_API_KEY: "sk_machine" },
                },
            },
        ]);
    });
});
