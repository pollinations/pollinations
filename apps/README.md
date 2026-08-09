# 📱 Pollinations Apps

Contains quest based community built projects and the app collection that has been submitted to pollinations & has successfully been reviewed and merged by a maintainer. 

- `deployments.json` configures apps deployed from this repository.
- `catalog.json` is the community showcase catalog.


## Submit Your App

Build something with Pollinations? Get it on the [showcase](https://pollinations.ai/apps) and earn a Pollen reward. One approved app per GitHub account does it.


## 1. Quest based App Submissions

Apps are those are built from [QUEST] are **auto-deployed to Cloudflare Pages** when merged to `main`.

**Trigger:** Any change in `apps/{app-name}/` → deploys to `https://{app-name}.pollinations.ai`

**What happens:**
1. PWA assets generated (favicon, og-image, manifest)
2. Dependencies installed
3. App built (if `buildCommand` in `deployments.json`)
4. Deployed to Cloudflare Pages

### Adding a New App

#### 1. Create from template
```bash
cp -r apps/_templates/react apps/my-app
```

#### 2. Register in `deployments.json`
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
git add apps/my-app apps/deployments.json
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

<a name="submission-criteria"></a>
### What Makes a Good App Submission

> To increase the chances of approval during app review, submitted apps should meet the following criteria:

- Have an account at [enter.pollinations.ai](https://enter.pollinations.ai) (sign up with GitHub)
- Your app actively uses the Pollinations API — image, text, audio, or video
- A public GitHub repository is helpful for review but optional
- Include a working demo URL (auto-deployed or external)
- Include a clear `README.md` in the app folder explaining what it does, which Pollinations models/APIs it uses, and how to run it locally

### What We're Looking For

- **It works.** Not a 404, not "coming soon", not an empty shell
- **It does something.** Beyond a raw API call — some custom UI, workflow, or actual user experience
- **It credits us.** "Powered by Pollinations" somewhere visible
- **It's not malicious.** No spam, no deceptive tools, no scams
- **Focused scope.** One clear purpose, clean and usable UI

### How to Submit

Open an issue with the [submission template](https://github.com/pollinations/pollinations/issues/new?template=app-submission.yml) and fill out the fields.

### What Happens Next

- An AI pre-review checks the live app, optional repository, duplicates, and evidence of Pollinations integration
- If information is missing, the bot comments with specific questions
- A maintainer verifies apps that are ready for review
- Approved apps are added automatically to [pollinations.ai/apps](https://pollinations.ai/apps)

### After

- Keep your app working — confirmed broken apps are delisted and the bot
  explains how to restore them on the original submission issue
- Changing your URL or name? Open a new PR

### Common Reasons for Rejection

- No clear Pollinations API usage
- Vague or incomplete app descriptions
- No working app or evidence of Pollinations integration
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
- 📋 [**All Apps**](https://pollinations.ai/apps) — Browse the full community app catalog.
- 🌐 [Browse on pollinations.ai](https://pollinations.ai/apps)
- ✏️ [Submit your app](https://github.com/pollinations/pollinations/issues/new?template=app-submission.yml)

## Authenticated App Review Safety

Routine screenshot capture stays anonymous. When an unresolved app genuinely
requires sign-in, review it locally with the dedicated Pollinations Agent
Google, GitHub, and Pollinations accounts under these rules:

- Only official Google, GitHub, and `enter.pollinations.ai` authentication is
  supported. Discord, email/password, magic-link, and other login providers are
  skipped. A Pollinations BYOP flow may continue through GitHub and must return
  to the original app before its screenshot can be accepted.
- Start Pollinations authorization with a `0` Pollen budget and a one-day
  expiry. This is enough to verify login and the post-login interface without
  allowing generation spend.
- If one real generation is necessary, use a new app-specific authorization
  capped at `0.05` Pollen and one day. Never authorize an unlimited budget or
  expiry.
- Grant no optional account permissions by default. Never grant API-key
  management access. Do not expose, copy, or create reusable API keys during
  app review.
- Never top up, purchase, subscribe, upload private files, send messages, or
  perform destructive actions from an app. An agent must not automate wallet
  top-ups.
- Revoke the app authorization after the review. A failed or suspicious login
  is evidence for the report, not a reason to weaken these limits.
- Explicit sexual content is rejected immediately without interacting with
  advertisements, age gates, or external links.

## Resources

- [API Docs](../APIDOCS.md)
- [App Ideas](IDEAS.md)
- [Discord](https://discord.gg/pollinations-ai-885844321461485618)
