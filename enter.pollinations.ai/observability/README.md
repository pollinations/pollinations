# Tinybird observability deploys

Deploys use the same local config pattern for staging and production. Both
config files are gitignored Tinybird CLI files created from the team-managed
Tinybird deploy credentials.

| Environment | Workspace | Config file |
|-------------|-----------|-------------|
| Staging | `pollinations_enter_staging` | `.tinyb.staging` |
| Production | `pollinations_enter` | `.tinyb` |

Run every change against staging first, then production:

```bash
npm run tinybird:check:staging --workspace pollinations-enter
npm run tinybird:deploy:staging --workspace pollinations-enter

npm run tinybird:check:production --workspace pollinations-enter
npm run tinybird:deploy:production --workspace pollinations-enter
```

The helper validates that the selected config file points to the expected
workspace before it runs `tb --cloud deploy --wait`.
