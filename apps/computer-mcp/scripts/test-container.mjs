// Run against `wrangler dev`, or a local proxy bound to the staging Worker.
import assert from "node:assert/strict";
import { setTimeout } from "node:timers/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = new URL(process.env.COMPUTER_MCP_URL ?? "http://localhost:8790/");
const user = process.env.COMPUTER_TEST_USER ?? `container-test-${Date.now()}`;
const clients = [];

async function connect(userId = user, agentId = "agent-one") {
    const client = new Client({ name: "container-test", version: "1.0.0" });
    const headers = { "x-pollinations-user-id": userId };
    if (agentId) headers["x-pollinations-agent-id"] = agentId;
    await client.connect(
        new StreamableHTTPClientTransport(url, { requestInit: { headers } }),
    );
    clients.push(client);
    return client;
}

async function bash(client, command, options = {}) {
    const result = await client.callTool(
        { name: "bash", arguments: { command, ...options } },
        undefined,
        { timeout: 180_000 },
    );
    const text = result.content
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n");
    assert.notEqual(result.isError, true, text);
    return text.trim();
}

try {
    const first = await connect();
    const { tools } = await first.listTools();
    assert.deepEqual(
        tools.map((tool) => tool.name),
        ["bash", "publish_file"],
    );
    assert.equal("mode" in tools[0].inputSchema.properties, false);
    console.log("PASS discovery without a mode selector");

    const runtime = await bash(
        first,
        "node --version && npm --version && cat /etc/os-release",
    );
    assert.match(runtime, /Debian/);
    console.log("PASS real Node, npm and Debian");

    const content = "favourite colour: 'blue' $HOME `date` — “naïve” ✓\n";
    await bash(first, "cat > memory/facts.md", { stdin: content });
    await first.close();
    const resumed = await connect();
    assert.equal(await bash(resumed, "cat memory/facts.md"), content.trim());
    console.log("PASS Unicode stdin and persistence across connections");

    await bash(resumed, "echo named > marker.txt", { workspace: "project" });
    assert.equal(
        await bash(resumed, "cat marker.txt", { workspace: "project" }),
        "named",
    );
    await bash(resumed, "test ! -e marker.txt");
    for (const [userId, agentId] of [
        [user, "agent-two"],
        [user, ""],
        [`${user}-other`, "agent-one"],
    ]) {
        const isolated = await connect(userId, agentId);
        await bash(isolated, "test ! -e memory/facts.md");
    }
    console.log("PASS caller, agent, direct access and workspace isolation");

    const failure = await resumed.callTool({
        name: "bash",
        arguments: { command: "echo expected-error >&2; exit 7" },
    });
    assert.equal(failure.isError, true);
    assert.match(JSON.stringify(failure.content), /exit code 7/);
    console.log("PASS error propagation");

    await bash(
        resumed,
        "mkdir -p project && cd project && npm init -y >/dev/null && npm install is-number@7.0.0 --ignore-scripts --no-audit --no-fund >/dev/null && node -e 'console.log(require(\"is-number\")(42))'",
    );
    assert.equal(
        await bash(
            resumed,
            "cd project && node -e 'console.log(require(\"is-number\")(42))'",
        ),
        "true",
    );
    console.log("PASS package installation and reuse");

    const published = await resumed.callTool({
        name: "publish_file",
        arguments: { path: "/workspace/memory/facts.md" },
    });
    assert.notEqual(published.isError, true, JSON.stringify(published.content));
    assert.match(
        published.content[0].text,
        /^https:\/\/media\.pollinations\.ai\//,
    );
    console.log("PASS file publishing");
    const server =
        "require('http').createServer((q, s) => s.end(q.method + ' ' + q.url)).listen(8000)";
    await bash(resumed, "cat > start.sh", { stdin: `node -e "${server}"\n` });
    const portUrl = (userId, agentId = "agent-one") => {
        const headers = { "x-pollinations-user-id": userId };
        if (agentId) headers["x-pollinations-agent-id"] = agentId;
        return [
            new URL("workspaces/default/ports/8000/hi?x=1", url),
            { headers },
        ];
    };
    const served = await fetch(...portUrl(user));
    assert.equal(await served.text(), "GET /hi?x=1");
    assert.equal(
        served.headers.get("x-pollinations-mcp-adjustment-id"),
        "computer.port_request.v1",
    );
    const foreign = await fetch(...portUrl(`${user}-other`));
    assert.equal(foreign.status, 502);
    console.log("PASS start.sh on first port request, private to the owner");

    const ssh = new WebSocket(new URL("workspaces/default/ssh", url), {
        headers: portUrl(user)[1].headers,
    });
    ssh.binaryType = "arraybuffer";
    const banner = await new Promise((resolve, reject) => {
        ssh.onmessage = (event) => resolve(Buffer.from(event.data).toString());
        ssh.onerror = reject;
    });
    ssh.close();
    assert.match(banner, /^SSH-2\.0-OpenSSH/);
    console.log("PASS SSH over WebSocket");

    if (process.argv.includes("--idle")) {
        await bash(resumed, "touch /tmp/computer-idle-test");
        console.log("Waiting for the five-minute idle shutdown...");
        await setTimeout(310_000);
        await bash(resumed, "test ! -e /tmp/computer-idle-test");
        assert.equal(
            await bash(resumed, "cat memory/facts.md"),
            content.trim(),
        );
        assert.equal(
            await bash(
                resumed,
                "cd project && node -e 'console.log(require(\"is-number\")(42))'",
            ),
            "true",
        );
        assert.equal(
            await (await fetch(...portUrl(user))).text(),
            "GET /hi?x=1",
        );
        console.log(
            "PASS idle shutdown, restoration of files and packages, start.sh rerun",
        );
    }
    console.log(`Test caller: ${user}`);
} finally {
    await Promise.allSettled(clients.map((client) => client.close()));
}
