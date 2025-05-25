# Pollinations.ai Pitch Deck

This folder contains the [Slidev](https://sli.dev) presentation for the Pollinations.ai pitch deck.

## Getting Started

### Installation

The latest version of Slidev (v51.6.0) is already installed in this folder.

### Running the Presentation

To start the slide show in development mode:

```bash
npm run dev
```

This will start a local server and open your default browser to view the presentation.

### Building for Production

To build the presentation for production:

```bash
npm run build
```

This will generate a static site in the `dist` folder that you can deploy anywhere.

### Exporting to PDF

To export the slides to PDF:

```bash
npm run export
```

## Deployment

### Deploying to Cloudflare Pages

#### Option 1: Direct Upload (Quick)

1. Build the presentation locally:
   ```bash
   npm run build
   ```

2. Go to [Cloudflare Pages](https://dash.cloudflare.com/?to=/:account/pages)
3. Click "Create a project" > "Direct Upload"
4. Name your project (e.g., "pollinations-pitch")
5. Drag and drop the entire `dist` folder
6. Click "Deploy site"

#### Option 2: Git Integration (Recommended)

1. Push your changes to GitHub
2. Go to [Cloudflare Pages](https://dash.cloudflare.com/?to=/:account/pages)
3. Click "Create a project" > "Connect to Git"
4. Select your repository
5. Configure the build settings:
   - Framework preset: None
   - Build command: `cd operations/pitch-deck/markdown-slides && npm run build`
   - Build output directory: `operations/pitch-deck/markdown-slides/dist`
6. Click "Save and Deploy"

#### Option 3: GitHub Actions (Automated)

This repository includes a GitHub Actions workflow that automatically deploys to Cloudflare Pages when you push to the main branch.

To set it up:
1. Create a Cloudflare API token with "Edit Cloudflare Pages" permissions
2. Add the following secrets to your GitHub repository:
   - `CF_API_TOKEN`: Your Cloudflare API token
   - `CF_ACCOUNT_ID`: Your Cloudflare account ID

## Creating New Slides

Edit the `slides.md` file to create your presentation. Slidev uses Markdown for content with a special syntax for slide navigation and features.

- Separate slides with `---`
- Use `#` for slide titles
- Regular Markdown syntax for content
- Code blocks with syntax highlighting
- Support for Vue components

## Learn More

- [Slidev Documentation](https://sli.dev)
- [GitHub Repository](https://github.com/slidevjs/slidev)
- [Cloudflare Pages Documentation](https://developers.cloudflare.com/pages/)
