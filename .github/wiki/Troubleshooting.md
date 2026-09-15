# Troubleshooting & FAQs

### Common Error Codes

#### 401 Unauthorised
Missing or malformed API key on restricted endpoints. Verify your key on [enter.pollinations.ai](https://enter.pollinations.ai) and ensure the `Authorization: Bearer <key>` header is present.

#### 429 Too Many Requests
Rate limit reached for your current tier. Reduce request frequency or level up your tier (e.g. Seed via Dev Points or Flower via an app submission) for higher concurrency.

#### 502 / 504 Gateway Timeouts
The upstream model provider timed out. The gateway attempts fallback routing automatically. If the failure persists, switch to an alternative model or check the status channel on the official Discord.

### Local Development Gotchas

#### Windows Wiki Clones
Avoid special characters like `?` in markdown filenames. File paths containing question marks fail on Windows NTFS filesystems during checkout.

#### Biome Formatting Checks
Continuous integration enforces formatting. Run the repo linter before committing:
```bash
npx @biomejs/biome check --write --config-path biome.jsonc <files>
```

#### Monorepo Aliases
When adding new modules under `gen.pollinations.ai/src/`, register paths inside `genAliases` in `vitest.config.ts` so unit tests resolve `@/...` imports properly.
