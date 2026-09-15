# Tiers & Ecosystem Extensions

### Developer Tiers & Pollens

Pollens represent generation credits. Tiers dictate request concurrency, rate limits, and model access pools.

| Tier | Prerequisites | Capabilities |
| :--- | :--- | :--- |
| **Anonymous** | None | Public endpoints, standard concurrency |
| **Spore** | Free account on [enter.pollinations.ai](https://enter.pollinations.ai) | Personal API key, basic usage analytics |
| **Seed** | 8+ Dev Points (account age, repo commits, stars) | Enhanced concurrency, prioritised request routing |
| **Flower** | Publish an approved app via formal issue submission | Higher pollen allocations, community showcase |
| **Nectar** | Sustained core or ecosystem contribution | Custom quotas, dedicated provider pools |
| **Router** | Validated external model infrastructure | Community Provider Directory hosting (BYOM) |

---

### Ecosystem Integration Models

#### 1. Bring Your Own Model (BYOM)
Approved developers holding the Router tier can host external OpenAI-compatible model endpoints on their own infrastructure and register them into the unified gateway directory.
* **Proxy Boundary**: The gateway strips incoming client API keys before relaying payloads to external servers.
* **Failover & Monitoring**: Automated health checks cycle failing endpoints out of active rotation and fall back to secondary providers.
* **Rewards**: Model hosts receive Pollen credits based on request volume and model tier pricing.
* **Documentation**: See [BRING_YOUR_OWN_MODEL.md](https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_MODEL.md) for endpoint requirements and allowlist submission.

#### 2. Bring Your Own Pollen (BYOP)
Connect User Wallets allows third-party applications to let their users pay for their own generation costs using personal Pollen balances.
* **App Keys**: Developers generate a publishable App Key (`pk_...`) in the dashboard. Users authenticate via an OAuth consent screen, granting your app a scoped session key (`sk_...`).
* **Developer Earnings**: Developers can opt into a 25% earnings markup on user requests credited directly to their own account balance.
* **Documentation**: See [BRING_YOUR_OWN_POLLEN.md](https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md) for implementation and redirect parameters.

#### 3. Custom Agents (Prompt & Code Agents)
Developers can publish custom AI agents hosted and callable directly through the platform.
* **Prompt Agents**: Combine custom system instructions, a selected base model, and optional MCP tools into a reusable callable model name (`<github-username>/<name>`).
* **Code Agents**: Deploy a self-contained `agent.ts` file from a public GitHub repository.
* **Documentation**: See [BUILD_YOUR_OWN_AGENT.md](https://github.com/pollinations/pollinations/blob/main/BUILD_YOUR_OWN_AGENT.md) for configuration schemas.

#### 4. Model Context Protocol (MCP)
The official MCP server enables local coding agents and desktop applications (such as Cursor, Claude Desktop, and Antigravity) to access Pollinations text and image generation natively.
* **Package**: [`@pollinations/model-context-protocol`](https://github.com/pollinations/pollinations/tree/main/packages/mcp)
* **Configuration**: Can be run via `npx @pollinations/model-context-protocol` or installed locally.
