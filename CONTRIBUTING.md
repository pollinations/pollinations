# Contributing to pollinations.ai

Choose an [open issue](https://github.com/pollinations/pollinations/issues), confirm its requirements, and implement the smallest complete solution. Bug fixes, focused features, tests, and documentation improvements are welcome.

## Submit an app

Built an app with Pollinations? Review [what makes a good submission](./apps/README.md#what-makes-a-good-app-submission) and use the [app submission form](https://github.com/pollinations/pollinations/issues/new?template=tier-app-submission.yml). Maintainers and automation handle the directory entry.

## Development workflow

1. Fork and clone the repository:

   ```bash
   git clone https://github.com/your-username/pollinations.git
   ```

2. Create a focused branch:

   ```bash
   git checkout -b fix/short-description
   ```

3. Make and test your changes. See [DEVELOP.md](./DEVELOP.md) for setup instructions.

4. Format changed JavaScript, TypeScript, JSON, and JSONC files:

   ```bash
   npx biome check --write <changed-file>
   ```

5. Commit and push your branch:

   ```bash
   git commit -m "fix: describe the change"
   git push origin fix/short-description
   ```

6. Open a pull request that explains the change, its verification, and the issue it addresses. Use `Fixes #123` when the pull request should close an issue.

## Pull request checklist

- Follow the surrounding code style and reuse existing utilities.
- Keep the change focused on the issue.
- Run the relevant service tests.
- Document non-obvious behavior and public API changes.
- Never commit secrets or API keys.

For questions, use [GitHub Discussions](https://github.com/pollinations/pollinations/discussions) or [Discord](https://discord.gg/pollinations-ai-885844321461485618).
