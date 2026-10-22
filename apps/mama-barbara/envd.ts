// Runs a script as `user` through envd, the agent in every E2B sandbox, the
// way polli's ssh setup does (packages/polli-cli/src/commands/sandbox/ssh.ts).
// Its Connect RPC takes and returns length-prefixed JSON messages.
export async function runInBox(
    box: {
        sandboxID: string;
        domain?: string | null;
        envdAccessToken?: string;
    },
    script: string,
    envs: Record<string, string>,
) {
    const request = Buffer.from(
        JSON.stringify({
            process: {
                cmd: "/bin/bash",
                args: ["-c", script],
                envs,
                cwd: "/home/user",
            },
        }),
    );
    const frame = Buffer.alloc(5 + request.length);
    frame.writeUInt32BE(request.length, 1);
    request.copy(frame, 5);
    const res = await fetch(
        `https://49983-${box.sandboxID}.${box.domain || "e2b.app"}/process.Process/Start`,
        {
            method: "POST",
            headers: {
                "content-type": "application/connect+json",
                authorization: `Basic ${Buffer.from("user:").toString("base64")}`,
                ...(box.envdAccessToken && {
                    "x-access-token": box.envdAccessToken,
                }),
            },
            body: frame,
        },
    );
    if (!res.ok) throw new Error(`envd ${res.status}: ${await res.text()}`);
    const body = Buffer.from(await res.arrayBuffer());
    let output = "";
    let exitCode: number | undefined;
    for (let at = 0; at + 5 <= body.length; ) {
        const length = body.readUInt32BE(at + 1);
        const message = JSON.parse(
            body.subarray(at + 5, at + 5 + length).toString(),
        );
        if (body[at] & 2 && message.error)
            throw new Error(`envd: ${message.error.message}`);
        const event = message.event ?? {};
        for (const data of [event.data?.stdout, event.data?.stderr]) {
            if (data) output += Buffer.from(data, "base64").toString();
        }
        // Protobuf JSON omits a zero exit code.
        if (event.end) exitCode = event.end.exitCode ?? 0;
        at += 5 + length;
    }
    if (exitCode !== 0)
        throw new Error(
            `exited with ${exitCode}: ${output.trim().slice(-500)}`,
        );
}
