import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { command, positional, run, string } from "@drizzle-team/brocli";

const __dirname = dirname(fileURLToPath(import.meta.url));

function secretsFile(environment: string) {
    return join(__dirname, "..", `.encrypted.${environment}.env`);
}

function parseSecrets(file: string): Record<string, string> {
    const content = execSync(`sops decrypt ${file}`, { encoding: "utf8" });
    return Object.fromEntries(
        content
            .split("\n")
            .map((line) => line.replace(/#.*$/, "").trim())
            .filter((line) => line !== "")
            .map((line) => line.split("="))
            .filter(([key, value]) => key && value)
            .map(([key, value]) => [key.trim(), value.trim()]),
    );
}

function putSecret(name: string, value: string, env?: string) {
    const envFlag = env ? `--env ${env}` : "";
    const command = `echo "${value}" | wrangler secret put ${name} ${envFlag}`;

    try {
        execSync(command, { stdio: "inherit" });
        console.log(`[ok] ${name}${env ? ` (${env})` : ""}`);
    } catch {
        console.error(`[error] ${name}${env ? ` (${env})` : ""}`);
    }
}

const parse = command({
    name: "parse",
    options: {
        file: positional().desc("Secrets file"),
        env: string().enum("staging", "production").required(),
    },
    handler: (opts) => {
        const file = opts.file || secretsFile(opts.env);
        console.log("Parsing secrets in:", file);
        const secrets = parseSecrets(file);
        console.log(secrets);
    },
});

const put = command({
    name: "put",
    options: {
        file: positional().desc("Secrets file"),
        env: string().enum("staging", "production").required(),
    },
    handler: (opts) => {
        const file = opts.file || secretsFile(opts.env);
        console.log("Putting secrets in:", file);
        const secrets = parseSecrets(file);
        for (const [name, value] of Object.entries(secrets)) {
            putSecret(name, value, opts.env);
        }
    },
});

run([parse, put]);
