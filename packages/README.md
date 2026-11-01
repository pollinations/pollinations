# Packages

Reusable clients, UI components and shared service code. Each package can be
understood independently of the rest of the repository.

## Public developer tools

| Package | Purpose |
| --- | --- |
| [sdk/](./sdk) | JavaScript/TypeScript API client, device login and React Pollinations Connect hooks. |
| [ui/](./ui) | UI components, account menu and drop-in sign-in button; SDK-backed components use `@pollinations/sdk/react`. |
| [polli-cli/](./polli-cli) | The `polli` command for generation, authentication, account management and Sites deployment. |
| [llm-pollinations/](./llm-pollinations) | Python provider connecting Pollinations models to Simon Willison's `llm` CLI and library. |

External apps use the published packages. Start with the [SDK](./sdk) for code,
or the [CLI](./polli-cli) for terminal use.

## Internal shared packages

| Package | Purpose |
| --- | --- |
| [auth/](./auth) | Private server/session and React helpers for Pollinations' internal dashboards. |
| [mcp/](./mcp) | Private tool handlers for the hosted [Pollinations MCP Worker](../apps/mcp); clients connect to the hosted service. |

## OAuth protocol examples

For integrations without the SDK, [examples/](./examples) contains two
dependency-free OAuth recipes:

- [Browser-only OAuth + PKCE](./examples/oauth-client-demo): direct token exchange and generation, with no backend.
- [Connect an existing user database](./examples/oauth-account-linking-demo): optional server-side account linking and encrypted delegated-key storage.

See the [Pollinations Pay guide](../BRING_YOUR_OWN_POLLEN.md) for the protocol and SDK/UI
integration options.
