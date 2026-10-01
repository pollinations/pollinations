import { getUserBalance, payerBucketToMeter } from "@shared/billing/balance.ts";
import { canCoverEstimatedCharge } from "@shared/billing/bucket-selection.ts";
import { roundPollenLedgerAmount } from "@shared/billing/precision.ts";
import { handleBalanceDeduction } from "@shared/billing/track-helpers.ts";
import { sendToTinybird } from "@shared/events.ts";
import { PaymentRequiredError } from "@shared/http/payment-required-error.ts";
import {
    priceToEventParams,
    usageToEventParams,
} from "@shared/schemas/generation-event.ts";
import { drizzle } from "drizzle-orm/d1";
import { type Context, Hono, type Next } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "@/env.ts";
import { auth, keyPermissionsLink } from "@/middleware/auth.ts";
import { edgeRateLimit } from "@/middleware/rate-limit-edge.ts";
import { requestIdentity } from "@/middleware/track.ts";

// exe.dev's HTTPS API is one endpoint whose POST body is an exe.dev CLI
// command. Gen forwards a checked subset of commands with the team token.
const EXE_EXEC = "https://exe.dev/exec";
// One exe.dev account runs every user's VMs; a name prefix names the owner.
const OWNED_VM = /^p[0-9a-f]{16}-/;
const MAX_VMS_PER_USER = 3;
// exe.dev's list price for a standalone VM of the default 2 vCPU, in pollen.
const VM_HOUR = 0.105;
const MAX_HOURS = 720;
// A VM carries the time it is paid until as a tag; the cron deletes it after.
const PAID_TAG = /^paid-(\d+)$/;
// exe.dev stops a command after 30 s, but that is time enough for a lot of output.
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;

type Vm = { vm_name: string; tags?: string[] };

type ExeContext = Context<Env>;

// exe.dev lexes the body like a shell, so every argument goes in single quotes.
const quote = (word: string) => `'${word.replaceAll("'", `'\\''`)}'`;

function exe(env: CloudflareBindings, words: string[]) {
    return fetch(EXE_EXEC, {
        method: "POST",
        headers: { authorization: `Bearer ${env.EXE_API_KEY}` },
        body: words.map(quote).join(" "),
    });
}

const relay = (response: Response) => new Response(response.body, response);

const badRequest = (message: string) => new HTTPException(400, { message });

// Splits a command line into words as a POSIX shell does: quotes and
// backslashes group characters, and nothing is expanded.
function splitWords(line: string): string[] {
    const words: string[] = [];
    let word: string | undefined;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (/\s/.test(char)) {
            if (word !== undefined) words.push(word);
            word = undefined;
        } else if (char === "'") {
            const end = line.indexOf("'", i + 1);
            if (end < 0) throw badRequest("Unbalanced quotes");
            word = (word ?? "") + line.slice(i + 1, end);
            i = end;
        } else if (char === '"') {
            word ??= "";
            for (i++; line[i] !== '"'; i++) {
                if (i >= line.length) throw badRequest("Unbalanced quotes");
                if (line[i] === "\\" && '"\\$`'.includes(line[i + 1])) i++;
                word += line[i];
            }
        } else if (char === "\\") {
            if (++i >= line.length) throw badRequest("Trailing backslash");
            word = (word ?? "") + line[i];
        } else {
            word = (word ?? "") + char;
        }
    }
    if (word !== undefined) words.push(word);
    return words;
}

// Reads `--name=value` and `--name value` flags; every other word is an
// argument. Only the flags listed are accepted.
function parseFlags(words: string[], allowed: string[]) {
    const flags: Record<string, string[]> = {};
    const args: string[] = [];
    for (let i = 0; i < words.length; i++) {
        const match = words[i].match(/^--?([^=]+)(?:=(.*))?$/s);
        if (!match) {
            args.push(words[i]);
            continue;
        }
        const [, name, inline] = match;
        if (!allowed.includes(name)) {
            throw badRequest(
                `${words[i]} is not available through Pollinations`,
            );
        }
        // --json is always on for API calls, and -l takes no value.
        if (name === "json" || name === "l") {
            flags[name] = [];
            continue;
        }
        const value = inline ?? words[++i];
        if (value === undefined) throw badRequest(`--${name} needs a value`);
        flags[name] = [...(flags[name] ?? []), value];
    }
    return { flags, args };
}

// A failed call of our own is never the caller's fault: their key was fine.
async function upstreamError(response: Response) {
    const detail = (await response.text()).slice(0, 300);
    return new HTTPException(502, {
        message: `exe.dev returned ${response.status}: ${detail}`,
    });
}

async function listVms(env: CloudflareBindings, long = false) {
    const response = await exe(env, long ? ["ls", "-l"] : ["ls"]);
    if (!response.ok) throw await upstreamError(response);
    return (await response.json<{ vms?: Vm[] }>()).vms ?? [];
}

const paidUntil = (vm: Vm) =>
    Math.max(
        0,
        ...(vm.tags ?? []).map((tag) => Number(tag.match(PAID_TAG)?.[1] ?? 0)),
    );

async function ownerPrefix(userId: string) {
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(userId),
    );
    const hex = [...new Uint8Array(digest).slice(0, 8)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
    return `p${hex}-`;
}

// A caller may name a VM with or without their prefix.
const ownName = (prefix: string, name: string) =>
    name.startsWith(prefix) ? name : prefix + name;

function parseHours(values: string[] | undefined) {
    const hours = Number(values?.at(-1) ?? 1);
    if (!Number.isInteger(hours) || hours < 1 || hours > MAX_HOURS) {
        throw badRequest(
            `--hours must be a whole number from 1 to ${MAX_HOURS}`,
        );
    }
    return hours;
}

async function requireFunds(c: ExeContext, price: number) {
    const apiKey = c.var.auth.apiKey;
    if (
        apiKey &&
        typeof apiKey.pollenBalance === "number" &&
        apiKey.pollenBalance < price
    ) {
        throw new PaymentRequiredError(
            "KEY_BUDGET_EXHAUSTED",
            `API key budget too low for this VM time (${price} pollen). Increase the key budget at ${keyPermissionsLink(apiKey.id, c.env.ENVIRONMENT)}; topping up the wallet does not increase this limit.`,
        );
    }
    const balance = await getUserBalance(
        drizzle(c.env.DB),
        c.var.auth.requireUser().id,
    );
    if (!canCoverEstimatedCharge(balance, price)) {
        throw new PaymentRequiredError(
            "INSUFFICIENT_BALANCE",
            `Insufficient balance for this VM time (${price} pollen). Top up at https://enter.pollinations.ai/top-up.`,
        );
    }
}

async function charge(c: ExeContext, price: number, startTime: Date) {
    let deduction: Awaited<ReturnType<typeof handleBalanceDeduction>> | null =
        null;
    try {
        deduction = await handleBalanceDeduction({
            db: drizzle(c.env.DB) as unknown as Parameters<
                typeof handleBalanceDeduction
            >[0]["db"],
            isBilledUsage: true,
            totalPrice: price,
            userId: c.var.auth.requireUser().id,
            apiKeyId: c.var.auth.apiKey?.id,
            apiKeyPollenBalance: c.var.auth.apiKey?.pollenBalance,
            // requireFunds checked the key budget; nothing was reserved.
            apiKeyReservedAmount: 0,
            byopClientKeyId: c.var.auth.apiKey?.byopClientKeyId,
            modelPaidOnly: false,
        });
    } catch (error) {
        c.var.log.error("VM time charge failed: {error}", {
            error: error instanceof Error ? error.message : String(error),
        });
    }
    const endTime = new Date();
    c.executionCtx.waitUntil(
        sendToTinybird(
            {
                id: crypto.randomUUID(),
                requestId: c.get("requestId"),
                requestPath: c.req.path,
                startTime,
                endTime,
                responseTime: endTime.getTime() - startTime.getTime(),
                responseStatus: 200,
                environment: c.env.ENVIRONMENT,
                eventType: "sandbox.lease",
                ...requestIdentity(c.var.auth),
                ...(deduction?.payerBucket
                    ? payerBucketToMeter(deduction.payerBucket)
                    : {}),
                modelRequested: "sandbox",
                resolvedModelRequested: "sandbox",
                modelUsed: "sandbox",
                modelProviderUsed: "exe",
                fallbackUsed: false,
                isFinal: true,
                isBilledUsage: true,
                ...priceToEventParams(),
                ...usageToEventParams(),
                totalCost: price,
                totalPrice: deduction?.billedPrice ?? 0,
                devPrice: price,
                markupRate: deduction?.markup?.markupRate ?? 0,
            },
            c.env.TINYBIRD_INGEST_URL,
            c.env.TINYBIRD_INGEST_TOKEN,
            c.var.log,
        ),
    );
}

// A standalone VM bills for as long as it exists, so creating one pays its
// first hours up front and tags the VM with the time they end.
async function createVm(c: ExeContext, prefix: string, words: string[]) {
    const startTime = new Date();
    const { flags, args } = parseFlags(words, [
        "json",
        "name",
        "image",
        "env",
        "setup-script",
        "comment",
        "hours",
    ]);
    if (args.length) throw badRequest("Usage: new [--name=<name>] [flags]");
    const hours = parseHours(flags.hours);
    const price = roundPollenLedgerAmount(hours * VM_HOUR);
    await requireFunds(c, price);

    const owned = (await listVms(c.env)).filter((vm) =>
        vm.vm_name.startsWith(prefix),
    );
    if (owned.length >= MAX_VMS_PER_USER) {
        throw new HTTPException(429, {
            message: `At most ${MAX_VMS_PER_USER} VMs per account. Delete one with rm first.`,
        });
    }
    const name = flags.name?.at(-1) ?? crypto.randomUUID().slice(0, 8);
    const until = Math.floor(startTime.getTime() / 1000) + hours * 3600;
    const response = await exe(c.env, [
        "new",
        "--standalone",
        "--no-email",
        `--name=${ownName(prefix, name)}`,
        `--tag=paid-${until}`,
        ...["image", "env", "setup-script", "comment"].flatMap((flag) =>
            (flags[flag] ?? []).map((value) => `--${flag}=${value}`),
        ),
    ]);
    if (response.ok) await charge(c, price, startTime);
    return relay(response);
}

// Adds prepaid hours to a VM, counted from when its paid time ends.
async function extendVm(c: ExeContext, prefix: string, words: string[]) {
    const startTime = new Date();
    const { flags, args } = parseFlags(words, ["json", "hours"]);
    if (args.length !== 1) throw badRequest("Usage: extend <vm> --hours=<n>");
    const name = ownName(prefix, args[0]);
    const vm = (await listVms(c.env)).find((vm) => vm.vm_name === name);
    if (!vm) throw new HTTPException(404, { message: `VM ${name} not found` });

    const hours = parseHours(flags.hours);
    const price = roundPollenLedgerAmount(hours * VM_HOUR);
    await requireFunds(c, price);
    const previous = paidUntil(vm);
    const until =
        Math.max(previous, Math.floor(startTime.getTime() / 1000)) +
        hours * 3600;
    const tagged = await exe(c.env, ["tag", name, `paid-${until}`]);
    if (!tagged.ok) throw await upstreamError(tagged);
    await charge(c, price, startTime);
    // The cron reads the latest tag, so a failed cleanup costs nothing.
    if (previous) {
        c.executionCtx.waitUntil(
            exe(c.env, ["tag", "-d", name, `paid-${previous}`]),
        );
    }
    return c.json({
        vm_name: name,
        paid_until: new Date(until * 1000).toISOString(),
    });
}

// exe.dev returns a command's exit code in an HTTP trailer, which a Worker
// cannot read. So the VM prints the exit code after a random marker, and gen
// moves it into an X-Exe-Exit header.
async function runOnVm(c: ExeContext, name: string, command: string[]) {
    const marker = crypto.randomUUID().replaceAll("-", "");
    const script = `(eval ${quote(command.join(" "))}); printf '\\n${marker} %d\\n' "$?"`;
    const response = await exe(c.env, ["ssh", name, script]);
    if (!response.ok || !response.body) return relay(response);

    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = response.body.getReader();
    for (
        let read = await reader.read();
        !read.done;
        read = await reader.read()
    ) {
        size += read.value.byteLength;
        if (size > MAX_OUTPUT_BYTES) {
            await reader.cancel();
            throw new HTTPException(413, {
                message: `Output is over ${MAX_OUTPUT_BYTES} bytes. Write it to a file and read it in parts.`,
            });
        }
        chunks.push(read.value);
    }
    const output = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        output.set(chunk, offset);
        offset += chunk.byteLength;
    }

    const headers = new Headers(response.headers);
    headers.delete("content-length");
    // latin1 maps each byte to one character, so indexes stay byte offsets.
    const tailStart = Math.max(0, size - 64);
    const tail = new TextDecoder("latin1").decode(output.subarray(tailStart));
    const exit = tail.match(new RegExp(`\\n${marker} (\\d+)\\n$`));
    if (!exit || exit.index === undefined) {
        return new Response(output, { status: response.status, headers });
    }
    headers.set("X-Exe-Exit", exit[1]);
    return new Response(output.subarray(0, tailStart + exit.index), {
        status: response.status,
        headers,
    });
}

async function execCommand(c: ExeContext) {
    const prefix = await ownerPrefix(c.var.auth.requireUser().id);
    const own = (name: string) => ownName(prefix, name);
    const words = splitWords(await c.req.text());
    const command =
        words[0] === "share" ? words.slice(0, 2) : words.slice(0, 1);
    const rest = words.slice(command.length);

    switch (command.join(" ")) {
        case "ls": {
            const { flags, args } = parseFlags(rest, ["json", "l"]);
            if (args.length) throw badRequest("Usage: ls [-l]");
            const vms = await listVms(c.env, "l" in flags);
            return c.json({
                vms: vms.filter((vm) => vm.vm_name.startsWith(prefix)),
            });
        }
        case "new":
            return createVm(c, prefix, rest);
        case "extend":
            return extendVm(c, prefix, rest);
        case "ssh": {
            // The command after the VM name runs on the VM as typed.
            const [name, ...script] = rest;
            if (!name || !script.length) {
                throw badRequest("Usage: ssh <vm> <command>");
            }
            return runOnVm(c, own(name), script);
        }
        case "rm": {
            const { args } = parseFlags(rest, ["json"]);
            if (!args.length) throw badRequest("Usage: rm <vm>...");
            return relay(await exe(c.env, ["rm", ...args.map(own)]));
        }
        case "share port": {
            const { args } = parseFlags(rest, ["json"]);
            const [name, port] = args;
            if (args.length !== 2 || !/^\d{1,5}$/.test(port)) {
                throw badRequest("Usage: share port <vm> <port>");
            }
            return relay(await exe(c.env, ["share", "port", own(name), port]));
        }
        case "restart":
        case "share show":
        case "share set-public":
        case "share set-private": {
            const { args } = parseFlags(rest, ["json"]);
            if (args.length !== 1) {
                throw badRequest(`Usage: ${command.join(" ")} <vm>`);
            }
            return relay(await exe(c.env, [...command, own(args[0])]));
        }
        default:
            throw new HTTPException(403, {
                message: `${command.join(" ") || "An empty command"} is not available through Pollinations. Use ls, new, extend, ssh, rm, restart or share (show, port, set-public, set-private).`,
            });
    }
}

async function requireVmAccess(c: ExeContext, next: Next) {
    if (!c.env.EXE_API_KEY) {
        throw new HTTPException(503, { message: "VMs are not configured" });
    }
    c.var.auth.requireUser();
    const apiKey = c.var.auth.apiKey;
    if (!apiKey?.permissions?.account?.includes("machines")) {
        throw new HTTPException(403, {
            message: `API key does not have 'account:machines' permission. Manage key permissions at ${keyPermissionsLink(apiKey?.id ?? "", c.env.ENVIRONMENT)}`,
        });
    }
    await next();
}

// Deletes every user VM whose paid time has run out. Runs from the cron.
export async function deleteExpiredVms(env: CloudflareBindings) {
    if (!env.EXE_API_KEY) return;
    const now = Date.now() / 1000;
    const expired = (await listVms(env)).filter(
        // Without a tags field the paid time is unknown, so the VM stays.
        (vm) => OWNED_VM.test(vm.vm_name) && vm.tags && paidUntil(vm) < now,
    );
    await Promise.all(
        expired.map(async (vm) => {
            const response = await exe(env, ["rm", vm.vm_name]);
            if (!response.ok) {
                console.error(
                    `Deleting expired VM ${vm.vm_name} failed: ${response.status} ${await response.text()}`,
                );
            }
        }),
    );
}

export const exeRoutes = new Hono<Env>()
    .use("*", edgeRateLimit, auth(), requireVmAccess)
    .post("/exec", execCommand);
