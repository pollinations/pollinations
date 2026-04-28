# 📱 Pollinations Apps

Contains quest based community built projects and the app collection that has been submitted to pollinations & has successfully been reviewed and merged by a maintainer. 


## Submit Your App

Build something with Pollinations? Get it on the [showcase](https://pollinations.ai/apps) and bump up to **flower tier**. One approved app per GitHub account does it.


## 1. Quest based App Submissions

Apps are those are built from [QUEST] are **auto-deployed to Cloudflare Pages** when merged to `main`.

**Trigger:** Any change in `apps/{app-name}/` → deploys to `https://{app-name}.pollinations.ai`

**What happens:**
1. PWA assets generated (favicon, og-image, manifest)
2. Dependencies installed
3. App built (if `buildCommand` in `apps.json`)
4. Deployed to Cloudflare Pages

### Adding a New App

#### 1. Create from template
```bash
cp -r apps/_templates/react apps/my-app
```

#### 2. Register in `apps.json`
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

#### 3. Push to main
```bash
git add apps/my-app apps/apps.json
git commit -m "Add my-app"
git push
```

Your app will be live at `https://my-app.pollinations.ai`

### Manual Deploy

```bash
# Deploy a single app
./apps/_scripts/deploy.sh <app-name>

# Requires CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID env vars
```

### App Types

| Type | Build | Example |
|------|-------|---------|
| **Pure HTML** | None | catgpt |
| **React + Vite** | `npm run build` | reimagine, chat |

### PWA Assets (Auto-Generated)

Each app gets:
- `favicon.ico`, `favicon-*.png`
- `icon-192.png`, `icon-512.png`
- `apple-touch-icon.png`
- `manifest.json`
- `og-image.png` (1200×630 social preview)

# 2. Community Created App Submissions 

### What Makes a Good App Submission

> To increase the chances of approval during app review, submitted apps should meet the following criteria:

- Have an account at [enter.pollinations.ai](https://enter.pollinations.ai) (sign up with GitHub)
- Be on **seed tier** or above
- Your app actively uses the Pollinations API — image, text, audio, or video
- Be **open-source** with a public GitHub repository
- Include a working demo URL (auto-deployed or external)
- Include a clear `README.md` in the app folder explaining what it does, which Pollinations models/APIs it uses, and how to run it locally

### What We're Looking For

- **It works.** Not a 404, not "coming soon", not an empty shell
- **It does something.** Beyond a raw API call — some custom UI, workflow, or actual user experience
- **It credits us.** "Powered by Pollinations" somewhere visible
- **It's not malicious.** No spam, no deceptive tools, no scams
- **Focused scope.** One clear purpose, clean and usable UI

### How to Submit

Open an issue with the [submission template](https://github.com/pollinations/pollinations/issues/new?template=tier-app-submission.yml) and fill out the fields. If your integration isn't obvious from poking at the app, drop in a screenshot or short clip — otherwise skip it.

### What Happens Next

- A bot checks the basics (registered, not a duplicate, attribution present)
- A maintainer takes a look
- If it's good, your app lands on [pollinations.ai/apps](https://pollinations.ai/apps) and your tier bumps to **flower**
- If something's off, we'll comment with what to fix

### After

- Keep your app working — broken apps get delisted after a heads-up
- Changing your URL or name? Open a new PR

### Common Reasons for Rejection

- No clear Pollinations API usage
- Vague or incomplete app descriptions
- Missing or private repository
- Spam, affiliate links, or misleading "money earning" claims
- Very low-effort generators

## Attribution

"Powered by Pollinations" is the one hard requirement. Pick whichever fits your app:

### 1. Plain Text

Drop "Powered by Pollinations" or "Built with Pollinations" into your footer, about page, splash screen, or readme.

### 2. The Badge

[`Built With pollinations.ai`](https://img.shields.io/badge/Built%20with-Pollinations-8a2be2?style=for-the-badge&logoColor=white&labelColor=6a0dad)

```markdown
[`Built With pollinations.ai`](https://img.shields.io/badge/Built%20with-Pollinations-8a2be2?style=for-the-badge&logoColor=white&labelColor=6a0dad)
```

### 3. The Logo

Grab a logo and link it to [pollinations.ai](https://pollinations.ai): [mark](https://pollinations.ai/logo.svg) · [wordmark (white)](https://pollinations.ai/wordmark-white.svg) · [wordmark (black)](https://pollinations.ai/wordmark-black.svg)

## Community Showcase

- 🔆 [**Greenhouse**](GREENHOUSE.md) — Curated highlights from every category
- 📋 [**All Apps**](APPS.md) — Full table for community created apps.
- 🌐 [Browse on pollinations.ai](https://pollinations.ai/apps)
- ✏️ [Submit your app](https://github.com/pollinations/pollinations/issues/new?template=tier-app-submission.yml)

## Resources

- [API Docs](../APIDOCS.md)
- [App Ideas](IDEAS.md)
- [Discord](https://discord.gg/pollinations-ai-885844321461485618)
