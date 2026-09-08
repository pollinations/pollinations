# Keeping local clones small

The repository's runtime and application behavior do not depend on Git history. When an app only needs the current source tree, use a shallow or partial clone instead of downloading the full history.

## Recommended clone commands

### Current snapshot only

```bash
git clone --depth 1 --single-branch https://github.com/pollinations/pollinations.git
```

This downloads only the default branch's tip. It is the best default for imports, CI jobs, containers, and local builds that do not inspect history.

### Current snapshot with lazy file contents

```bash
git clone --filter=blob:none --no-checkout https://github.com/pollinations/pollinations.git
cd pollinations
git checkout main
```

This uses Git's partial-clone support: file contents are fetched when Git needs them. It is useful when tooling checks only a subset of the tree. The remote and Git hosting provider must support upload-pack filtering.

### Shallow + partial clone

```bash
git clone --depth 1 --filter=blob:none --single-branch https://github.com/pollinations/pollinations.git
```

This minimizes both commit history and initially transferred file contents while preserving a normal working tree after checkout.

## When full history is required

Use a full clone for `git blame`, archaeology, release analysis, or work that needs to create patches against older commits. A shallow clone can be expanded later:

```bash
git fetch --unshallow
```

## Maintainer guidance

- Prefer shallow or partial clone instructions over rewriting public history. History rewrites invalidate existing clones, disrupt forks, and can break commit links and external automation.
- Do not remove tracked source, assets, fixtures, or lockfiles solely to reduce repository size; those can affect builds or users.
- Keep generated output, caches, local data, dependency directories, credentials, and temporary artifacts out of Git with `.gitignore`.
- Review unusually large additions before merging. If a large binary must remain available to users, evaluate Git LFS or external artifact storage rather than committing repeated generated versions.
- Repository maintenance (for example, repacking or server-side garbage collection) is an administrative operation for repository administrators; it does not change the checked-out application.

These approaches change transfer and local storage behavior only. They do not change the code delivered by a checkout, the API, or the behavior of deployed applications.
