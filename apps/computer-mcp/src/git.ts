import type { Workspace } from "@cloudflare/computer";
import {
    createGitClient,
    type GitClientFactory,
} from "@cloudflare/computer/git";
import { type CredentialProvider, createGit, type FileSystem } from "just-git";

type WorkspaceFilesystem = Workspace["fs"];

// The shell's `git` command calls `cli` on this client. just-git answers it:
// it covers far more of real git (mv, rebase, cherry-pick, ranges, ...) than
// the built-in isomorphic-git CLI. The other client methods stay built-in.
export function createJustGitClient(
    credentials: CredentialProvider,
): GitClientFactory {
    const factory = createGitClient();
    return (options) => {
        const client = factory(options);
        const ws = options.ws as unknown as Workspace;
        const fs = justGitFs(ws.fs);
        client.cli = ({ argv, cwd = "/", env = {}, stdin = "" }) =>
            createGit({
                // Read on every call: the Durable Object fills it in per request.
                identity: options.defaultIdentity && {
                    ...options.defaultIdentity,
                },
                credentials,
            }).execute(argv, {
                fs,
                cwd,
                env: new Map(Object.entries(env)),
                stdin,
            });
        return client;
    };
}

function justGitFs(fs: WorkspaceFilesystem): FileSystem {
    const toStat = async (stat: ReturnType<WorkspaceFilesystem["stat"]>) => {
        const s = await stat;
        return {
            isFile: s.isFile,
            isDirectory: s.isDirectory,
            isSymbolicLink: s.isSymbolicLink,
            mode: s.mode,
            size: s.size,
            mtime: new Date(s.mtime),
        };
    };
    return {
        readFile: (path) => fs.readFile(path, "utf8"),
        readFileBuffer: async (path) =>
            new Uint8Array(
                await new Response(await fs.readFile(path)).arrayBuffer(),
            ),
        writeFile: (path, content) => fs.writeFile(path, content),
        exists: (path) =>
            fs.lstat(path).then(
                () => true,
                () => false,
            ),
        stat: (path) => toStat(fs.stat(path)),
        lstat: (path) => toStat(fs.lstat(path)),
        mkdir: (path, options) => fs.mkdir(path, options),
        readdir: async (path) =>
            (await fs.readdir(path)).map((entry) => entry.name),
        rm: (path, options) => fs.rm(path, options),
        readlink: (path) => fs.readlink(path),
        symlink: (target, path) => fs.symlink(target, path),
    };
}
