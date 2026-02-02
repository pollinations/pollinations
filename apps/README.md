# 📱 Pollinations Apps

Frontend apps powered by pollinations.ai. Auto-deployed to `{app-name}.pollinations.ai`.

## Folder Structure

```
apps/
├── apps.json              # App registry (required for auto-deploy)
├── _scripts/              # Deploy scripts
│   ├── deploy.sh          # Main deploy script
│   └── deploy-app.js      # Cloudflare infrastructure setup
├── _templates/            # Starter templates
│   ├── html/              # Pure HTML template
│   └── react/             # React + Vite template
├── operations/            # Business docs (not deployed)
│
├── ai-dungeon-master/     # 🎮 Deployable apps
├── catgpt/
├── chat/
├── gsoc/
├── ... (other apps)
```

## Auto-Deployment

Apps are **auto-deployed to Cloudflare Pages** when merged to `main`.

**Trigger:** Any change in `apps/{app-name}/` → deploys to `https://{app-name}.pollinations.ai`

**What happens:**
1. PWA assets generated (favicon, og-image, manifest)
2. Dependencies installed
3. App built (if `buildCommand` in `apps.json`)
4. Deployed to Cloudflare Pages

## Adding a New App

### 1. Create from template
```bash
cp -r apps/_templates/react apps/my-app
```

### 2. Register in `apps.json`
```json
{
  "my-app": {
    "subdomain": "my-app",
    "buildCommand": "npm run build",
    "outputDir": "dist",
    "title": "My App",
    "description": "What my app does"
  }
}
```

### 3. Push to main
```bash
git add apps/my-app apps/apps.json
git commit -m "Add my-app"
git push
```

Your app will be live at `https://my-app.pollinations.ai`

## Manual Deploy

```bash
# Deploy a single app
./apps/_scripts/deploy.sh gsoc

# Requires CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID env vars
```

## App Types

| Type | Build | Example |
|------|-------|---------|
| **Pure HTML** | None | catgpt |
| **React + Vite** | `npm run build` | gsoc, chat |

## PWA Assets (Auto-Generated)

Each app gets:
- `favicon.ico`, `favicon-*.png`
- `icon-192.png`, `icon-512.png`
- `apple-touch-icon.png`
- `manifest.json`
- `og-image.png` (1200×630 social preview)

## Resources

- [API Docs](../APIDOCS.md)
- [App Ideas](IDEAS.md)
- [App Showcase](./APPS.md)
- [Discord](https://discord.gg/pollinations-ai-885844321461485618)
