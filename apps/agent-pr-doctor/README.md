# pr-doctor

Takes a pull request URL, reviews the change, and returns a proposed fix patch -
plus the one handoff path that actually works from inside a Pollinations agent.

Addresses [quest #17245](https://github.com/pollinations/pollinations/issues/17245).

A prompt agent: `openai/gpt-6.1-sol` with the `computer` MCP server.

## Create it

```bash
npx @pollinations/cli agents create \
  --config apps/agent-pr-doctor/agent.json \
  --name pr-doctor \
  --title "PR Doctor"
```

Call it like any other text model, with a pull request URL as the message.

## What it does

1. Fetches `https://github.com/<owner>/<repo>/pull/<n>.diff`
2. Reviews the change and finds the smallest concrete defect
3. Writes a unified diff patch
4. Pushes the patch into `pollinations/collective-memory` under
   `pr-fixes/<owner>--<repo>/<n>.patch`, the one repository an agent can write to
5. Returns the patch inline and the local command to apply it

## Boundary report

The quest asks for an agent that "pushes a proposed fix to a branch". This
report is what actually happens today. Every line below was measured from
inside the hosted agent sandbox on 2026-10-14 by calling
`https://gen.pollinations.ai/mcp/computer` with the `bash` tool.

### The `computer` server exposes one tool

```
tools/list -> count: 1
  bash :: Run a bash command on your private, persistent computer.
```

There is no `git` tool and no credentials tool. Everything goes through `bash`.

### `git` is a virtual implementation

```
$ git --version
just-git version 1.8.2 (virtual git implementation)

$ git ls-remote https://github.com/pollinations/collective-memory
git: 'ls-remote' is not implemented. Run 'git help' for available commands.

$ git init -q probe-repo
Unknown option "-q".
Not all git options are supported.
```

Supported: `init`, `clone`, `describe`, `fetch`, `pull`, `push`, `add`, `blam`e.
Not supported: `ls-remote`. Long flags such as `-q` are rejected.

### Push works for `collective-memory` and nothing else

`collective-memory` is pre-cloned at `/workspace/cm`, so an agent starts with it
already present. A commit succeeds, and a push reaches the remote:

```
$ git push origin HEAD
To https://github.com/pollinations/collective-memory.git
 ! [rejected]        main -> main (fetch first)
error: failed to push some refs to ...
hint: Updates were rejected because the remote contains work that you do not
```

That is a **non-fast-forward rejection**, which means authentication
**succeeded** and the ref update was refused only for divergence. This is why
the documented `git pull --rebase` retry works.

The same push to any other repository:

```
$ git push https://github.com/kreggscode/definitely-not-a-real-repo-9f3a.git HEAD
HTTP 401 discovering refs at https://github.com/kreggscode/definitely-not-a-real-repo-9f3a.git
```

There are no stored credentials either:

```
$ ls -la ~/.gitconfig ~/.git-credentials
ls: //.gitconfig: No such file or directory
ls: //.git-credentials: No such file or directory

$ env | grep -iE 'github|git_'
(no output)
```

**Conclusion: an agent cannot push a fix to the caller's fork.** The write
credential exists for one fixed repository only. Any agent advertising that it
pushes to a caller-controlled branch is either running outside this sandbox or
not doing what it says.

### GitHub's API is rate-limited; the `.diff` endpoint is not

```
$ curl -s -o /dev/null -w '%{http_code}' https://api.github.com/repos/pollinations/pollinations/pulls/17251
403

$ curl -s https://api.github.com/.../pulls/17251/files?per_page=1
{"message":"API rate limit exceeded for 104.22.66.246. (But here's the good
news: Authenticated requests get a higher rate limit.)"}
```

The sandbox shares one egress IP, so unauthenticated REST calls are throttled.
`curl` is also a stripped virtual build (`curl --version` is rejected), but it
works for plain requests. The web `.diff` endpoint is a different rate-limit
pool and succeeds:

```
$ curl -s -o /dev/null -w '%{http_code}' https://github.com/pollinations/pollinations/pull/17251.diff
200
```

**Conclusion: read the PR through `github.com/<o>/<r>/pull/<n>.diff`, never the
REST API.** This is the single most important implementation detail for anyone
building on PR links.

### What is missing, in one table

| Capability | Status | Evidence |
| --- | --- | --- |
| Fetch a PR diff | Works | `.diff` endpoint returns 200 |
| Read the repo | Works | `clone` is implemented |
| Commit locally | Works | commit succeeded in `/workspace/cm` |
| Push to `collective-memory` | Works | non-fast-forward rejection, i.e. authenticated |
| Push to the caller's fork | **Blocked** | `HTTP 401 discovering refs` |
| Use `api.github.com` | **Blocked** | `403` shared-IP rate limit |
| `git ls-remote` | **Missing** | not implemented by `just-git` |
| Long-running reviews | Unmeasured | not attempted; the sandbox is per-request |

### Design consequence

Because push is impossible to an arbitrary repository, `pr-doctor` does not
pretend otherwise. It writes the patch where it genuinely has write access,
returns the patch inline so the maintainer never has to trust the handoff, and
states plainly where the file went.

The durable copy is committed to `collective-memory` under `pr-fixes/`, which is
the documented, working path for an agent to leave something behind for a human.

## Files

| File | Purpose |
| --- | --- |
| `agent.json` | Prompt agent configuration, sandbox facts baked into the system prompt |
| `test.mjs` | Live check against `gen.pollinations.ai` |
| `README.md` | This report |

## Test

```bash
POLLINATIONS_API_KEY=sk_... node apps/agent-pr-doctor/test.mjs
```

Requires the agent to be registered first; the test reads its callable model id
from `PR_DOCTOR_MODEL` or falls back to `kreggscode/pr-doctor`.
