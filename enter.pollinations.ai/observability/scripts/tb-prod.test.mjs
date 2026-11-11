import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);

test("production SQL helper distinguishes query failures from empty results", async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "tb-prod-test-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    let fixture;
    const server = createServer((_request, response) => {
        response.writeHead(fixture.status);
        response.end(fixture.body);
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const { stdout: curl } = await exec("sh", ["-c", "command -v curl"]);

    // Exercise the real helper, jq, and curl against a local HTTP server.
    // Only credential loading and the production destination are replaced.
    await writeFile(
        join(directory, "sops"),
        "#!/bin/sh\nprintf '%s\\n' '{\"TINYBIRD_READ_TOKEN\":\"test-only\"}'\n",
        { mode: 0o755 },
    );
    await writeFile(
        join(directory, "curl"),
        `#!/bin/bash
args=()
for arg; do
    if [ "$arg" = "https://api.europe-west2.gcp.tinybird.co/v0/sql" ]; then
        arg="$TB_TEST_URL"
    fi
    args+=("$arg")
done
exec "$TB_TEST_CURL" "\${args[@]}"
`,
        { mode: 0o755 },
    );

    for (const [name, status, body, ok] of [
        ["rows", 200, '{"data":[{"count":2}],"rows":1}', true],
        ["empty rows", 200, '{"data":[],"rows":0}', true],
        ["JSONCompact", 200, '{"data":[[2]],"rows":1}', true],
        ["SQL error", 200, '{"error":"Resource missing"}', false],
        ["error with data", 200, '{"error":"Query failed","data":[]}', false],
        ["missing data", 200, '{"rows":0}', false],
        ["null data", 200, '{"data":null}', false],
        ["wrong data type", 200, '{"data":{}}', false],
        ["wrong envelope", 200, "[]", false],
        ["invalid JSON", 200, "upstream unavailable", false],
        ["empty response", 200, "", false],
        ["HTTP error", 400, '{"error":"Invalid SQL"}', false],
        ["HTTP error with data", 503, '{"data":[]}', false],
    ]) {
        await t.test(name, async () => {
            fixture = { status, body };
            const result = await exec(
                "bash",
                [
                    fileURLToPath(new URL("./tb-prod.sh", import.meta.url)),
                    "--check",
                ],
                {
                    env: {
                        ...process.env,
                        PATH: `${directory}:${process.env.PATH}`,
                        TB_TEST_CURL: curl.trim(),
                        TB_TEST_URL: `http://127.0.0.1:${server.address().port}/v0/sql`,
                    },
                },
            ).then(
                (output) => ({ ...output, code: 0 }),
                (error) => error,
            );
            if (ok) {
                assert.equal(result.code, 0, result.stderr);
                assert.deepEqual(JSON.parse(result.stdout), JSON.parse(body));
            } else {
                assert.notEqual(result.code, 0);
                assert.equal(result.stdout, "");
                if (status >= 400) assert.match(result.stderr, /curl:.*22/);
                else if (body) assert.match(result.stderr, /jq:/);
            }
        });
    }
});
