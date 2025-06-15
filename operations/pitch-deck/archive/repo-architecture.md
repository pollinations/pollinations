# Pollinations Pitch Deck Repository Architecture

```
/
├── markdown-slides/
│   ├── docs/
│   │   ├── 00-pitch-deck.md
│   │   ├── 01-executive-summary.md
│   │   ├── 02-vision-mission.md
│   │   ├── 03-business-model.md
│   │   ├── 04-roadmap.md
│   │   ├── 05-financial-model.md
│   │   ├── 07-tech-architecture.md
│   │   ├── 08-sdk-ad-integration.md
│   │   ├── 09-competitive-landscape.md
│   │   ├── 10-team.md
│   │   ├── 11-risk-register.md
│   │   ├── 12-traction-metrics.md
│   │   └── 13-ecosystem-analysis.md
│   ├── media/
│   │   ├── circular_economy_genz.png
│   │   ├── fly-wheel-genz.png
│   │   ├── media_requests_per_day_genz.png
│   │   ├── paintpointsgenz.png
│   │   ├── paintpointsgenz-3.png
│   │   ├── piechart_countries_genz.png
│   │   ├── pollinations_fix_genz.png
│   │   ├── pollinations-ai-logo.png
│   │   ├── pollinations_unit_v6_slide_1
│   │   ├── pollinations_unit_v6_slide_2
│   │   ├── roblox_usage.png
│   │   ├── roblox_video.mov
│   │   ├── traction_infoslide2.png
│   │   ├── traction_infoslide3.png
│   │   └── youth-ad-market.png
│   ├── scripts/
│   │   └── create_docs_context.js
│   ├── node_modules/
│   ├── .github/
│   ├── package.json
│   ├── package-lock.json
│   ├── slides.md
│   ├── slidev.config.ts
│   ├── wrangler.toml
│   ├── README.md
│   └── index.html.bak
└── archive/
    ├── best-practice/
    ├── due-diligence/
    ├── media/
    ├── pitch.com templates/
    ├── market-size-research.md
    ├── antler-review-v1.md
    ├── gemini-review.md
    ├── overview.md
    ├── laurent-general-review.md
    ├── pitchdeck-structure.md
    └── slides_pre_restructure.md
```

## Directory Structure

```
/
├── markdown-slides/         # Main pitch deck content
│   ├── docs/               # Markdown files for each slide/section
│   ├── media/              # Images and videos used in the presentation
│   ├── scripts/            # Utility scripts
│   ├── node_modules/       # Dependencies for the slide framework
│   ├── package.json        # Project dependencies and scripts
│   ├── package-lock.json   # Lock file for dependencies
│   ├── slides.md           # Main entry point for the slides
│   ├── slidev.config.ts    # Configuration for the slide framework
│   ├── wrangler.toml       # Cloudflare Workers configuration
│   └── README.md           # Project documentation
└── archive/                # Previous versions and research materials
    ├── best-practice/      # Best practice guidelines
    ├── due-diligence/      # Due diligence materials
    ├── media/              # Archived media files
    └── pitch.com templates/ # Templates from pitch.com
```

## Content Organization

### Pitch Deck Slides (`markdown-slides/docs/`)

The presentation is organized into numbered markdown files that represent different sections:

1. `00-pitch-deck.md` - Complete pitch deck
2. `01-executive-summary.md` - Executive summary section
3. `02-vision-mission.md` - Vision and mission statement
4. `03-business-model.md` - Business model explanation
4. `04-roadmap.md` - Product and business roadmap
5. `05-financial-model.md` - Financial projections and model
6. `07-tech-architecture.md` - Technical architecture details
7. `08-sdk-ad-integration.md` - SDK and ad integration information
8. `09-competitive-landscape.md` - Competitive analysis
9. `10-team.md` - Team members and backgrounds
10. `11-risk-register.md` - Risk analysis and mitigation strategies
11. `12-traction-metrics.md` - Traction and key metrics
12. `13-ecosystem-analysis.md` - Analysis of the ecosystem around the product

### Media Assets (`markdown-slides/media/`)

Contains images and videos used in the presentation, including:
- Logo files
- Charts and diagrams
- Screenshots and demonstration videos
- Infographics targeted toward Gen Z audience

### Scripts (`markdown-slides/scripts/`)

Contains utility scripts for managing the presentation:
- `create_docs_context.js` - Script to generate context for documentation

### Archive (`archive/`)

Contains historical materials, research, and previous versions:
- Market size research
- Reviews and feedback (Antler, Gemini, Laurent)
- Previous pitch deck structures and slides
- Best practices and templates

## Technical Implementation

The pitch deck appears to be built using a framework like Slidev or a similar markdown-to-presentation tool, with:
- TypeScript configuration (`slidev.config.ts`)
- Cloudflare Workers integration for hosting (`wrangler.toml`)
- Node.js dependency management (`package.json`)

The slides use a class-based structure with scroll functionality and navigation between sections. 