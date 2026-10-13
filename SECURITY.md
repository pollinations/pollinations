# Security policy

## Report privately

Send security reports to [hello@pollinations.ai](mailto:hello@pollinations.ai). Include:

- The affected URL, component and version, where applicable.
- A description, reproduction steps or a minimal proof of concept.
- The potential impact and any suggested fix.

Keep vulnerability details private while we assess the report and coordinate disclosure. Do not post exploit details or sensitive data in public issues, pull requests or discussions. Ordinary bugs and feature requests belong in [GitHub issues](https://github.com/pollinations/pollinations/issues).

## Scope

This policy covers Pollinations-operated services and code in the [pollinations/pollinations repository](https://github.com/pollinations/pollinations), including the website, API, SDK, CLI, MCP server, bots and infrastructure.

Report concrete security impact, such as:

- Unauthorized access, privilege escalation or code execution.
- Exposure of private data or credentials.
- Bypasses of authentication, billing or access controls.
- Exploitable service availability, dependency or deployment vulnerabilities.
- Prompt injection that exposes private data or causes unauthorized tool use or privileged actions.

Unexpected or unsafe model output alone, moderation complaints, self-XSS without impact on others, and ordinary rate-limit responses are not security vulnerabilities under this policy. Report third-party issues to their maintainers unless the vulnerability arises from our integration.

## Testing boundaries

Use local environments and your own accounts and data. Obtain explicit approval from the relevant system owner before testing live systems; this policy does not authorize attacks or override our [Terms of Service](https://pollinations.ai/terms).

Do not disrupt services, access or modify other users' data, use social engineering, or test third-party infrastructure without its owner's authorization. If you encounter private data, stop testing and report the issue without copying or sharing that data.

## Responses and rewards

We prioritize reports by demonstrated impact and available capacity. We cannot guarantee a response or fix timeline. We coordinate disclosure for confirmed vulnerabilities and may publish an advisory when appropriate. Public credit requires your consent.

Pollinations is an open-source project and offers no cash bounties. Useful reports, issues and fixes may receive Pollen API credits after maintainer review. Rewards and amounts are not guaranteed; Pollen is not a cash payout.

_Last updated: 2026-10-13_
