# GitHub Pages Deployment

The React chat UI is configured to automatically deploy to GitHub Pages.

## Setup Instructions

### 1. Enable GitHub Pages

In the repository settings:
1. Go to Settings → Pages
2. Under "Build and deployment", select "GitHub Actions" as the source
3. Save the settings

### 2. Automatic Deployment

The workflow `.github/workflows/deploy-pages.yml` will automatically:
- Build the React app whenever code is pushed to `main` or `copilot/improve-react-chat-ui` branches
- Deploy the built app to GitHub Pages

### 3. Access the Deployed App

Once deployed, the app will be available at:
**https://cloudcompile.github.io/pollinations-chat-ui/**

## Manual Deployment

You can also trigger a deployment manually:
1. Go to the "Actions" tab in the repository
2. Select "Deploy React App to GitHub Pages" workflow
3. Click "Run workflow"

## Local Development

To run the app locally:

```bash
cd react-app
npm install
npm run dev
```

The app will be available at http://localhost:5173

## Build for Production

To build the app locally:

```bash
cd react-app
npm run build
```

The built files will be in the `react-app/dist` directory.
