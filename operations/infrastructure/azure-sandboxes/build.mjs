#!/usr/bin/env node
// Builds the Azure templates' image and imports it into each sandbox group
// given, as the disk image gen's AZURE_SANDBOX_IMAGE names there. It all runs
// on Azure: a builder box gets this checkout's ../e2b and this folder, builds
// ../e2b/e2b.Dockerfile on what E2B's builder adds (e2b-base.Dockerfile), then
// the Dockerfile here, and serves the result
// from a registry on a port of its own, which Azure imports from. Then a box
// from the image must start envd with its token before the ids are printed.
// Needs `az login` with the Data Owner role on the groups.
//
//   node operations/infrastructure/azure-sandboxes/build.mjs <group-url>...
//
// A group URL is the sandbox group's data plane:
// https://management.<region>.azuredevcompute.io/subscriptions/<sub>/resourceGroups/<rg>/sandboxGroups/<group>
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const groups = process.argv.slice(2);
if (!groups.length) {
    console.error("usage: build.mjs <group-url>...");
    process.exit(1);
}
const here = new URL(".", import.meta.url).pathname;
const commit = execFileSync(
    "git",
    ["-C", here, "rev-parse", "--short", "HEAD"],
    {
        encoding: "utf8",
    },
).trim();
// macOS's tar would add its resource forks.
const sources = execFileSync(
    "tar",
    ["-czf", "-", "-C", `${here}..`, "e2b", "azure-sandboxes"],
    { env: { ...process.env, COPYFILE_DISABLE: "1" } },
).toString("base64");
const token = execFileSync(
    "az",
    [
        "account",
        "get-access-token",
        "--resource",
        "https://dynamicsessions.io",
        "--query",
        "accessToken",
        "-o",
        "tsv",
    ],
    { encoding: "utf8" },
).trim();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const region = (group) => new URL(group).hostname.split(".")[1];

async function azure(url, init = {}) {
    const response = await fetch(
        `${url}${url.includes("?") ? "&" : "?"}api-version=2026-02-01-preview`,
        {
            ...init,
            headers: {
                authorization: `Bearer ${token}`,
                "content-type": "application/json",
            },
        },
    );
    const text = await response.text();
    if (!response.ok) {
        throw new Error(
            `${init.method ?? "GET"} ${url}: ${response.status} ${text}`,
        );
    }
    return text ? JSON.parse(text) : null;
}

const put = (url, body) =>
    azure(url, { method: "PUT", body: JSON.stringify(body) });

async function running(group, id) {
    for (let tries = 0; tries < 60; tries++) {
        if ((await azure(`${group}/sandboxes/${id}`)).state === "Running") {
            return;
        }
        await sleep(2000);
    }
    throw new Error(`box ${id} did not start`);
}

const sh = async (group, id, command) =>
    (
        await azure(`${group}/sandboxes/${id}/executeShellCommand`, {
            method: "POST",
            body: JSON.stringify({ command }),
        })
    ).stdout.trim();

// Docker runs without iptables in a box, so builds use the host's network.
const build = `set -e
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq docker.io docker-buildx >/dev/null
setsid dockerd --iptables=false --ip6tables=false >/root/dockerd.log 2>&1 </dev/null &
until docker info >/dev/null 2>&1; do sleep 1; done
docker run -d --network host --name registry registry:2
cd /src
cp /etc/ssl/certs/adc-egress-proxy-ca.crt azure-sandboxes/egress-ca.crt
docker build --network host -t e2b-base -f azure-sandboxes/e2b-base.Dockerfile \
    --build-arg BASE="$(sed -n 's/^FROM //p' e2b/e2b.Dockerfile)" azure-sandboxes
sed 's/^FROM .*/FROM e2b-base/' e2b/e2b.Dockerfile > /root/e2b.Dockerfile
docker build --network host -t polli-e2b -f /root/e2b.Dockerfile e2b
docker build --network host -t localhost:5000/polli-azure azure-sandboxes
docker push localhost:5000/polli-azure | sed -n 's/.*digest: \\(sha256:[0-9a-f]*\\).*/\\1/p' > /root/digest
`;

// envd must answer only with the token, at Azure's port URL.
async function smokeTest(group, image) {
    const accessToken = randomBytes(32).toString("hex");
    const box = await put(`${group}/sandboxes`, {
        sourcesRef: { diskImage: { id: image } },
        resources: { cpu: "2000m", memory: "2048Mi" },
        labels: { pollinations_role: "image-smoke-test" },
        environment: {
            POLLI_ENVD_INIT: JSON.stringify({
                accessToken,
                defaultUser: "user",
            }),
        },
        ports: [{ port: 49983, auth: { anonymous: true } }],
        cmd: ["/usr/local/bin/polli-box"],
    });
    try {
        await running(group, box.id);
        const envd = `https://${box.id}--49983.${region(group)}.adcproxy.io`;
        for (let tries = 0; ; tries++) {
            if ((await fetch(`${envd}/health`).catch(() => null))?.ok) break;
            if (tries > 120) throw new Error("envd did not start");
            await sleep(500);
        }
        const read = (headers) =>
            fetch(`${envd}/files?path=/home/user/.bashrc&username=user`, {
                headers,
            }).then((response) => response.status);
        const [without, withToken] = [
            await read({}),
            await read({ "x-access-token": accessToken }),
        ];
        if (without !== 401 || withToken !== 200) {
            throw new Error(
                `envd answered ${without} without the token, ${withToken} with it`,
            );
        }
    } finally {
        await azure(`${group}/sandboxes/${box.id}`, { method: "DELETE" });
    }
}

const [home] = groups;
const builder = await put(`${home}/sandboxes`, {
    sourcesRef: { diskImage: { name: "ubuntu", isPublic: true } },
    resources: { cpu: "4000m", memory: "8192Mi", disk: "61440Mi" },
    labels: { pollinations_role: "image-builder" },
    lifecycle: { autoSuspendPolicy: { enabled: false } },
    ports: [{ port: 5000, auth: { anonymous: true } }],
});
console.log(`builder box ${builder.id}`);
try {
    await running(home, builder.id);
    const script = Buffer.from(build).toString("base64");
    await sh(
        home,
        builder.id,
        `mkdir -p /src && echo ${sources} | base64 -d | tar -xz -C /src && echo ${script} | base64 -d > /root/build.sh && setsid nohup sh -c 'bash /root/build.sh > /root/build.log 2>&1; echo $? > /root/build.exit' >/dev/null 2>&1 </dev/null & echo started`,
    );
    let exit = "";
    while (!exit) {
        await sleep(15_000);
        exit = await sh(
            home,
            builder.id,
            "cat /root/build.exit 2>/dev/null || true",
        );
        console.log(await sh(home, builder.id, "tail -n 1 /root/build.log"));
    }
    const digest = await sh(home, builder.id, "cat /root/digest");
    if (exit !== "0" || !digest.startsWith("sha256:")) {
        console.error(await sh(home, builder.id, "tail -n 40 /root/build.log"));
        throw new Error(`build exited with ${exit}`);
    }
    const base = `${builder.id}--5000.${region(home)}.adcproxy.io/polli-azure@${digest}`;
    for (const group of groups) {
        let image = await put(`${group}/diskimages`, {
            image: { base },
            labels: { name: "pollinations", commit },
        });
        while (image.status?.state !== "Ready") {
            if (image.status?.state === "Failed") {
                throw new Error(`import failed: ${image.status.errorMessage}`);
            }
            await sleep(5000);
            image = await azure(`${group}/diskimages/${image.id}`);
        }
        await smokeTest(group, image.id);
        console.log(`${group}\n  AZURE_SANDBOX_IMAGE = "${image.id}"`);
    }
} finally {
    await azure(`${home}/sandboxes/${builder.id}`, { method: "DELETE" });
}
