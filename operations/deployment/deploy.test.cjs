const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { copyFile, mkdir, mkdtemp, rm, writeFile } = require("node:fs/promises");
const { createServer } = require("node:http");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

for (const paths of [["/health"], ["/first", "/last"]]) {
    test(`deployment verifies every manifest URL: ${paths.join(", ")}`, async (t) => {
        const requests = [];
        const server = createServer((request, response) => {
            requests.push(request.url);
            response.end("ok");
        });
        server.listen(0, "127.0.0.1");
        await once(server, "listening");
        t.after(() => new Promise((resolve) => server.close(resolve)));
        const root = await mkdtemp(join(tmpdir(), "deployment-health-test-"));
        t.after(() => rm(root, { recursive: true, force: true }));
        const script = join(root, "operations/deployment/deploy.sh");
        await mkdir(join(root, "operations/deployment"), { recursive: true });
        await mkdir(join(root, "apps/test"), { recursive: true });
        await copyFile(join(__dirname, "deploy.sh"), script);
        await writeFile(
            join(root, "apps/test/deploy.json"),
            JSON.stringify({
                target: "script",
                deploy: ":",
                verify: paths.map(
                    (path) =>
                        `http://127.0.0.1:${server.address().port}${path}`,
                ),
            }),
        );
        const child = spawn("bash", [script, "apps/test"]);
        let output = "";
        child.stdout.on("data", (data) => {
            output += data;
        });
        child.stderr.on("data", (data) => {
            output += data;
        });
        const [code] = await once(child, "close");
        assert.equal(code, 0, output);
        assert.deepEqual(requests, paths);
    });
}
