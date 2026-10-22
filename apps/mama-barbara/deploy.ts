// Deploys Mama to her sandbox, the one named mama-barbara: checks out this
// commit there and restarts her. CI runs it from this folder (deploy.json)
// with POLLINATIONS_API_KEY, a key with `machines` on the account that owns
// the sandbox. Her token and users stay in the sandbox.
import { runInBox } from "./envd.ts";

const GEN = "https://gen.pollinations.ai/alpha/e2b";
const { POLLINATIONS_API_KEY: KEY, GITHUB_SHA: SHA } = process.env;
if (!KEY || !SHA) {
    throw new Error("POLLINATIONS_API_KEY and GITHUB_SHA are required");
}

type Box = {
    sandboxID: string;
    state: string;
    domain?: string;
    envdAccessToken?: string;
};

async function gen<T>(path: string): Promise<T> {
    const res = await fetch(`${GEN}${path}`, {
        headers: { authorization: `Bearer ${KEY}` },
    });
    if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
    return (await res.json()) as T;
}

const DEPLOY = `set -euo pipefail
REPO=$HOME/pollinations
[ -d "$REPO/.git" ] || git clone --quiet --depth 1 --filter=blob:none --no-checkout --sparse https://github.com/pollinations/pollinations "$REPO"
cd "$REPO"
git sparse-checkout set apps/mama-barbara apps/telegram-agent
git fetch --quiet --depth 1 origin "$SHA"
git checkout --quiet --force FETCH_HEAD
bash apps/mama-barbara/start.sh`;

const [mama] = await gen<Box[]>(
    `/v2/sandboxes?metadata=${encodeURIComponent("name=mama-barbara")}`,
);
if (!mama) throw new Error("No sandbox named mama-barbara");
const box = await gen<Box>(`/sandboxes/${mama.sandboxID}`);
if (box.state !== "running") {
    throw new Error(`Mama's sandbox ${box.sandboxID} is ${box.state}`);
}
await runInBox(box, DEPLOY, { SHA });
console.log(`Mama runs ${SHA} in ${box.sandboxID}`);
