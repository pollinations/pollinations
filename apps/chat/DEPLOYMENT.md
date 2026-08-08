# Cloudflare Pages Deployment

The React chat UI is deployed to Cloudflare Pages as part of the monorepo apps workflow.

## Setup Instructions

### 1. App registration

`apps/chat` is registered in `apps/apps.json`. The deploy workflow only deploys apps present in that registry.

### 2. Automatic Deployment

The workflow `.github/workflows/apps-deploy-changed.yml` will automatically:
- Detect changes under `apps/chat/` on push to `main`
- Build the app with `npm run build`
- Upload the build output to Cloudflare Pages
- Verify the origin at `https://chat.myceli.ai`
- Cut over the public URL to `https://chat.pollinations.ai`

### 3. Access the Deployed App

The live app is available at:
**https://chat.pollinations.ai**

## Local Development

To run the app locally:

```bash
cd apps/chat
npm install
npm run dev
```

The app will be available at http://localhost:5173

## Build for Production

To build the app locally:

```bash
cd apps/chat
npm run build
```

The built files will be in the `apps/chat/dist` directory.
