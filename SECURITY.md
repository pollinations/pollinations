# Security Policy

## Report a vulnerability

Report security vulnerabilities privately. Do not open a public issue, discussion, or pull request.

- Email [hello@pollinations.ai](mailto:hello@pollinations.ai).
- Or contact a maintainer on [Discord](https://discord.gg/pollinations-ai-885844321461485618).

Include:

- a clear description of the issue;
- steps to reproduce or a proof of concept;
- the potential impact; and
- suggested mitigations, if available.

We aim to acknowledge reports within 72 hours and will coordinate disclosure after remediation when appropriate. With your consent, we will credit your report; you may also remain anonymous.

## Scope

This policy covers the [`pollinations/pollinations`](https://github.com/pollinations/pollinations) repository, including:

- the Pollinations website and frontend;
- API, backend, caching, and billing services; and
- the SDK, MCP server, CLI, and repository-hosted apps and bots.

Report third-party vulnerabilities to their maintainers unless the issue comes from Pollinations' integration.

## Examples of vulnerabilities

- Remote code execution, privilege escalation, or command injection
- Authentication or authorization bypasses
- Sensitive-data or secret exposure
- Denial-of-service, rate-limit, or billing bypasses
- Prompt injection that crosses an authorization boundary, exposes sensitive data, or invokes privileged tools
- Demonstrated supply-chain attacks
- Exposed debug endpoints or insecure configuration
- CI/CD and deployment pipeline vulnerabilities

## Out of scope

- Self-XSS
- Exceeding normal API rate limits without a new exploit
- Bugs limited to unrelated third-party projects
- Social engineering
- Feature requests, moderation feedback, or model-output preferences

For general questions, use [GitHub Discussions](https://github.com/pollinations/pollinations/discussions). Never post sensitive security information publicly.

_Last updated: 2026-07-12_
