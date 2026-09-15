# Architecture & Services

The platform operates as a high-throughput, privacy-first gateway proxying generation requests directly to inference providers and community hosts. Prompt data is not stored.

### Request Flow

```mermaid
flowchart LR
    Client([Client Request]) --> Gateway["gen.pollinations.ai<br/><i>Hono Gateway</i>"]
    Gateway --> Check{"Auth &<br/>Rate Check"}
    Check -->|Valid| Router["Provider Router"]
    Check -->|Exceeded / Invalid| Reject["429 / 401"]
    Router --> Cloud["Official Providers"]
    Router --> BYOM["Community Providers<br/><i>Router Tier</i>"]
    Cloud --> Response([Client Response])
    BYOM --> Response

    classDef client fill:#F3EBDE,stroke:#cfc8b8,stroke-width:2px,color:#110518
    classDef gateway fill:#D8DFF8,stroke:#A4B4DE,stroke-width:2px,color:#110518
    classDef check fill:#E9D9EF,stroke:#C9A9E4,stroke-width:2px,color:#110518
    classDef reject fill:#ffd1d1,stroke:#f87171,stroke-width:2px,color:#7f1d1d
    classDef router fill:#F5FABC,stroke:#E8F372,stroke-width:2px,color:#110518
    classDef provider fill:#D4F0D7,stroke:#A8E6A2,stroke-width:2px,color:#110518

    class Client,Response client
    class Gateway gateway
    class Check check
    class Reject reject
    class Router router
    class Cloud,BYOM provider
```

### Monorepo Map

```mermaid
flowchart TB
    subgraph FRONTEND["Frontends & Apps"]
        ENTER["enter.pollinations.ai<br/><i>Dashboard · Keys · Metrics</i><br/>React · TanStack · D1/DO"]
        APPS["apps/<br/><i>Official & core apps</i>"]
    end

    subgraph SERVICES["Core Services"]
        GEN["gen.pollinations.ai<br/><i>Unified inference proxy</i><br/>text · image · audio · video · 3D<br/>Hono · CF Workers / Node"]
        MEDIA["media.pollinations.ai<br/><i>Media catalog + delivery cache</i><br/>CF Workers · R2"]
    end

    subgraph PKGS["Shared Packages"]
        SDK["packages/sdk<br/><i>TS SDK + React hooks</i><br/>@pollinations/sdk"]
        MCP["packages/mcp<br/><i>Model Context Protocol server</i>"]
        CLI["packages/polli-cli<br/><i>Terminal client</i>"]
        UI["packages/ui<br/><i>Component library</i><br/>React · Tailwind"]
    end

    EXT["Community Apps<br/><i>external repos · linked via APPS.md</i>"]

    ENTER --> SDK
    ENTER --> UI
    APPS --> SDK
    APPS --> UI
    SDK --> GEN
    SDK --> MEDIA
    MCP --> GEN
    CLI --> GEN
    EXT -.-> SDK

    classDef service fill:#D8DFF8,stroke:#A4B4DE,stroke-width:2px,color:#110518
    classDef front fill:#E9D9EF,stroke:#C9A9E4,stroke-width:2px,color:#110518
    classDef pkg fill:#D4F0D7,stroke:#A8E6A2,stroke-width:2px,color:#110518
    classDef ext fill:#F3EBDE,stroke:#cfc8b8,stroke-width:2px,stroke-dasharray: 5 5,color:#4a3f5c

    class GEN,MEDIA service
    class ENTER,APPS front
    class SDK,MCP,CLI,UI pkg
    class EXT ext
```

### Monorepo Directory Breakdown

| Directory | Service / Purpose | Primary Stack |
| :--- | :--- | :--- |
| `gen.pollinations.ai/` | Unified inference proxy for text, image, audio, video, 3D | Hono, Cloudflare / Node |
| `enter.pollinations.ai/` | Developer dashboard, API key management, account metrics | React, TanStack Router, D1/DO |
| `media.pollinations.ai/` | Media cataloguing and delivery cache | Cloudflare Workers, R2 |
| `packages/sdk/` | Official TypeScript SDK and React hooks (`@pollinations/sdk`) | TypeScript, React |
| `packages/mcp/` | Model Context Protocol server for local and agent tooling | Node.js |
| `packages/ui/` | Shared component library and design system | React, Tailwind |
| `packages/polli-cli/` | Terminal client for script execution | Node.js CLI |
| `packages/n8n/` | Official workflow automation nodes (`@pollinations/n8n`) | TypeScript, n8n |
| `apps/` | Official and core applications maintained by the team | Mixed |

*Note: Community applications are maintained in their respective external repositories and indexed via `APPS.md`.*
