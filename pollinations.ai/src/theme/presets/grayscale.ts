import { LLMThemeResponse, processTheme } from "../style/theme-processor";

export const GrayscaleMinimalTheme: LLMThemeResponse = {
    "slots": {
        "slot_0": {
            "hex": "#FFFFFF",
            "ids": ["text.primary", "button.primary.border", "logo.main"],
        },
        "slot_1": {
            "hex": "#A1A1A1",
            "ids": ["text.secondary"],
        },
        "slot_2": {
            "hex": "#1A1A1A",
            "ids": ["input.bg", "button.disabled.bg", "border.subtle"],
        },
        "slot_3": {
            "hex": "#2E2E2E",
            "ids": ["input.border", "border.main"],
        },
        "slot_4": {
            "hex": "#4D4D4D",
            "ids": ["input.placeholder"],
        },
        "slot_5": {
            "hex": "#262626",
            "ids": ["button.secondary.bg"],
        },
        "slot_6": {
            "hex": "#333333",
            "ids": ["button.secondary.border", "shadow.highlight.sm"],
        },
        "slot_7": {
            "hex": "#2A2A2A",
            "ids": ["button.hover.overlay"],
        },
        "slot_8": {
            "hex": "#3D3D3D",
            "ids": ["button.active.overlay"],
        },
        "slot_9": {
            "hex": "#808080",
            "ids": ["button.focus.ring", "background.particle"],
        },
        "slot_10": {
            "hex": "#E5E5E5",
            "ids": ["indicator.image"],
        },
        "slot_11": {
            "hex": "#D4D4D4",
            "ids": ["indicator.text"],
        },
        "slot_12": {
            "hex": "#666666",
            "ids": ["text.tertiary"],
        },
        "slot_13": {
            "hex": "#A3A3A3",
            "ids": ["indicator.audio"],
        },
        "slot_14": {
            "hex": "#737373",
            "ids": ["indicator.video", "logo.accent"],
        },
        "slot_15": {
            "hex": "#404040",
            "ids": ["border.strong", "background.element2"],
        },
        "slot_16": {
            "hex": "#444444",
            "ids": ["shadow.highlight.md"],
        },
        "slot_17": {
            "hex": "#888888",
            "ids": ["text.caption"],
        },
        "slot_18": {
            "hex": "#000000",
            "ids": [
                "text.inverse",
                "shadow.brand.sm",
                "shadow.brand.md",
                "shadow.brand.lg",
                "shadow.dark.sm",
                "shadow.dark.md",
                "shadow.dark.lg",
                "shadow.dark.xl",
            ],
        },
        "slot_19": {
            "hex": "#F2F2F2",
            "ids": [
                "text.brand",
                "input.text",
                "button.primary.bg",
                "border.brand",
                "border.highlight",
                "background.element1",
            ],
        },
        "slot_20": {
            "hex": "#EBEBEB",
            "ids": ["text.highlight"],
        },
        "slot_21": {
            "hex": "#050505",
            "ids": ["surface.page", "background.base"],
        },
        "slot_22": {
            "hex": "#0F0F0F",
            "ids": ["surface.card"],
        },
        "slot_23": {
            "hex": "#121212",
            "ids": ["surface.base", "border.faint"],
        },
    },
    "borderRadius": {
        "radius.button": "6px",
        "radius.subcard": "6px",
        "radius.card": "8px",
    },
    "fonts": {
        "font.title": "Space Grotesk",
        "font.headline": "Inter",
        "font.body": "Inter",
    },
    "opacity": {
        "opacity.card": "1",
        "opacity.overlay": "0.95",
        "opacity.glass": "0.8",
    },
};

export const GrayscaleMinimalCssVariables = processTheme(
    GrayscaleMinimalTheme,
).cssVariables;

// Copy from: "Grayscale, minimal"
export const GrayscaleMinimalCopy = {
    "APPS_PAGE.title.text": "Ecosystem",
    "APPS_PAGE.subtitle.text":
        "Pollinations-powered tools. Browse. Build. Ship.",
    "COMMUNITY_PAGE.title.text": "Contribute",
    "COMMUNITY_PAGE.subtitle.text":
        "A space for creators and developers to connect and build.",
    "COMMUNITY_PAGE.newsTitle.text": "What's New",
    "COMMUNITY_PAGE.newsFilePath":
        "https://raw.githubusercontent.com/pollinations/pollinations/production/NEWS/transformed/highlights.md",
    "COMMUNITY_PAGE.discordTitle.text": "💬 Discord",
    "COMMUNITY_PAGE.discordSubtitle.text":
        "Connect with builders. Share work. Find support.",
    "COMMUNITY_PAGE.githubTitle.text": "🛠️ GitHub",
    "COMMUNITY_PAGE.githubSubtitle.text":
        "Contribute code. Report issues. Submit apps. Star us.",
    "COMMUNITY_PAGE.joinDiscordButton.text": "Join Discord",
    "COMMUNITY_PAGE.contributeButton.text": "Contribute",
    "COMMUNITY_PAGE.votingTitle.text": "Have Your Say",
    "COMMUNITY_PAGE.votingSubtitle.text":
        "We build what the community wants. Vote on what matters to you:",
    "COMMUNITY_PAGE.votingIssues.0.emoji": "🤖",
    "COMMUNITY_PAGE.votingIssues.0.title": "Which models should we add next?",
    "COMMUNITY_PAGE.votingIssues.0.url":
        "https://github.com/pollinations/pollinations/issues/5321",
    "COMMUNITY_PAGE.votingIssues.1.emoji": "💳",
    "COMMUNITY_PAGE.votingIssues.1.title": "What payment methods do you want?",
    "COMMUNITY_PAGE.votingIssues.1.url":
        "https://github.com/pollinations/pollinations/issues/4826",
    "COMMUNITY_PAGE.votingIssues.2.emoji": "🔐",
    "COMMUNITY_PAGE.votingIssues.2.title": "What login providers do you want?",
    "COMMUNITY_PAGE.votingIssues.2.url":
        "https://github.com/pollinations/pollinations/issues/5543",
    "COMMUNITY_PAGE.supportersTitle.text": "Supporters",
    "COMMUNITY_PAGE.supportersSubtitle.text":
        "Recognizing those who contribute to this platform.",
    "COMMUNITY_PAGE.supportersList.0.name": "Perplexity AI",
    "COMMUNITY_PAGE.supportersList.0.url": "https://www.perplexity.ai/",
    "COMMUNITY_PAGE.supportersList.0.description":
        "AI-powered search and conversational answer engine",
    "COMMUNITY_PAGE.supportersList.1.name": "AWS Activate",
    "COMMUNITY_PAGE.supportersList.1.url": "https://aws.amazon.com/",
    "COMMUNITY_PAGE.supportersList.1.description": "GPU Cloud Credits",
    "COMMUNITY_PAGE.supportersList.2.name": "io.net",
    "COMMUNITY_PAGE.supportersList.2.url": "https://io.net/",
    "COMMUNITY_PAGE.supportersList.2.description":
        "Decentralized GPU network for AI compute",
    "COMMUNITY_PAGE.supportersList.3.name": "BytePlus",
    "COMMUNITY_PAGE.supportersList.3.url": "https://www.byteplus.com/",
    "COMMUNITY_PAGE.supportersList.3.description":
        "Official ByteDance cloud services and AI solutions",
    "COMMUNITY_PAGE.supportersList.4.name": "Google Cloud for Startups",
    "COMMUNITY_PAGE.supportersList.4.url": "https://cloud.google.com/",
    "COMMUNITY_PAGE.supportersList.4.description": "GPU Cloud Credits",
    "COMMUNITY_PAGE.supportersList.5.name": "NVIDIA Inception",
    "COMMUNITY_PAGE.supportersList.5.url":
        "https://www.nvidia.com/en-us/deep-learning-ai/startups/",
    "COMMUNITY_PAGE.supportersList.5.description": "AI startup support",
    "COMMUNITY_PAGE.supportersList.6.name": "Azure (MS for Startups)",
    "COMMUNITY_PAGE.supportersList.6.url": "https://azure.microsoft.com/",
    "COMMUNITY_PAGE.supportersList.6.description": "OpenAI credits",
    "COMMUNITY_PAGE.supportersList.7.name": "Cloudflare",
    "COMMUNITY_PAGE.supportersList.7.url":
        "https://developers.cloudflare.com/workers-ai/",
    "COMMUNITY_PAGE.supportersList.7.description":
        "Put the connectivity cloud to work for you.",
    "COMMUNITY_PAGE.supportersList.8.name": "Scaleway",
    "COMMUNITY_PAGE.supportersList.8.url": "https://www.scaleway.com/",
    "COMMUNITY_PAGE.supportersList.8.description":
        "Europe's empowering cloud provider",
    "COMMUNITY_PAGE.supportersList.9.name": "Modal",
    "COMMUNITY_PAGE.supportersList.9.url": "https://modal.com/",
    "COMMUNITY_PAGE.supportersList.9.description":
        "High-performance AI infrastructure",
    "COMMUNITY_PAGE.supportersList.10.name": "NavyAI",
    "COMMUNITY_PAGE.supportersList.10.url": "https://api.navy/",
    "COMMUNITY_PAGE.supportersList.10.description":
        "AI API provider for OpenAI o3 and Gemini models",
    "COMMUNITY_PAGE.supportersList.11.name": "Nebius",
    "COMMUNITY_PAGE.supportersList.11.url": "https://nebius.com/",
    "COMMUNITY_PAGE.supportersList.11.description":
        "AI-optimized cloud infrastructure with NVIDIA GPU clusters",
    "COMMUNITY_PAGE.supporterLogoPrompt":
        "Brutalist logo design with bold geometric shapes, heavy lines, stark contrast, raw minimalist aesthetic, transparent background (no background), flat design style. Company:",
    "COMMUNITY_PAGE.supporterLogoModel": "nanobanana",
    "DOCS_PAGE.title.text": "Integrate",
    "DOCS_PAGE.intro.text":
        "Our API is simple, powerful, and elegant. Single endpoint for text, images, and audio—this is where your vision takes flight.",
    "DOCS_PAGE.apiReference.text":
        "Dive into our full API docs for detailed information. AI agents can use our optimized prompt for seamless integration.",
    "DOCS_PAGE.fullApiDocsButton.text": "Full API Docs",
    "DOCS_PAGE.agentPromptButton.text": "Agent Prompt",
    "DOCS_PAGE.copiedLabel.text": "Copied!",
    "DOCS_PAGE.imageGenerationTitle.text": "Image Generation",
    "DOCS_PAGE.pickPromptLabel.text": "Pick a prompt",
    "DOCS_PAGE.modelSelectLabel.text": "Model",
    "DOCS_PAGE.parametersLabel.text": "Parameters",
    "DOCS_PAGE.generatingLabel.text": "Generating...",
    "DOCS_PAGE.copyUrlButton.text": "Copy URL",
    "DOCS_PAGE.imagePrompts.0": "a blooming flower in golden hour",
    "DOCS_PAGE.imagePrompts.1": "bees pollinating wildflowers",
    "DOCS_PAGE.imagePrompts.2": "organic mycelium network patterns",
    "DOCS_PAGE.imagePrompts.3": "harmonious forest ecosystem",
    "DOCS_PAGE.imagePrompts.4": "symbiotic nature interactions",
    "DOCS_PAGE.imagePrompts.5": "flowing river through biosphere",
    "DOCS_PAGE.imageParameters.0.key": "width",
    "DOCS_PAGE.imageParameters.0.value": "1024",
    "DOCS_PAGE.imageParameters.0.description": "Image width in pixels",
    "DOCS_PAGE.imageParameters.1.key": "height",
    "DOCS_PAGE.imageParameters.1.value": "1024",
    "DOCS_PAGE.imageParameters.1.description": "Image height in pixels",
    "DOCS_PAGE.imageParameters.2.key": "seed",
    "DOCS_PAGE.imageParameters.2.value": "42",
    "DOCS_PAGE.imageParameters.2.description":
        "Random seed for reproducible results",
    "DOCS_PAGE.imageParameters.3.key": "enhance",
    "DOCS_PAGE.imageParameters.3.value": "true",
    "DOCS_PAGE.imageParameters.3.description": "Let AI improve your prompt",
    "DOCS_PAGE.imageParameters.4.key": "nologo",
    "DOCS_PAGE.imageParameters.4.value": "true",
    "DOCS_PAGE.imageParameters.4.description": "Remove Pollinations watermark",
    "DOCS_PAGE.imageParameters.5.key": "safe",
    "DOCS_PAGE.imageParameters.5.value": "true",
    "DOCS_PAGE.imageParameters.5.description": "Enable safety filters",
    "DOCS_PAGE.imageParameters.6.key": "private",
    "DOCS_PAGE.imageParameters.6.value": "true",
    "DOCS_PAGE.imageParameters.6.description": "Hide from public feeds",
    "DOCS_PAGE.textGenerationTitle.text": "Text Generation",
    "DOCS_PAGE.modelLabel.text": "Model",
    "DOCS_PAGE.defaultModelLabel.text": "Default: openai",
    "DOCS_PAGE.optionalLabel.text": "Optional",
    "DOCS_PAGE.textPrompts.0": "explain pollinations.ai",
    "DOCS_PAGE.textPrompts.1": "write a poem about nature",
    "DOCS_PAGE.textPrompts.2": "describe ecosystem harmony",
    "DOCS_PAGE.textPrompts.3": "explain symbiosis",
    "DOCS_PAGE.textParameters.0.key": "system",
    "DOCS_PAGE.textParameters.0.value": "You are helpful",
    "DOCS_PAGE.textParameters.0.description": "System prompt for context",
    "DOCS_PAGE.textParameters.1.key": "json",
    "DOCS_PAGE.textParameters.1.value": "true",
    "DOCS_PAGE.textParameters.1.description": "Return response in JSON format",
    "DOCS_PAGE.textParameters.2.key": "temperature",
    "DOCS_PAGE.textParameters.2.value": "0.7",
    "DOCS_PAGE.textParameters.2.description":
        "Creativity (0=strict, 2=creative)",
    "DOCS_PAGE.textParameters.3.key": "stream",
    "DOCS_PAGE.textParameters.3.value": "true",
    "DOCS_PAGE.textParameters.3.description": "Stream response in real-time",
    "DOCS_PAGE.textParameters.4.key": "private",
    "DOCS_PAGE.textParameters.4.value": "true",
    "DOCS_PAGE.textParameters.4.description": "Hide from public feeds",
    "DOCS_PAGE.modelDiscoveryTitle.text": "Model Discovery",
    "DOCS_PAGE.selectTypeLabel.text": "Select a type",
    "DOCS_PAGE.imageTypeLabel.text": "Image",
    "DOCS_PAGE.textTypeLabel.text": "Text",
    "DOCS_PAGE.textOpenAITypeLabel.text": "Text (OpenAI)",
    "DOCS_PAGE.loadingModelsLabel.text": "Loading models...",
    "DOCS_PAGE.authenticationTitle.text": "Authentication",
    "DOCS_PAGE.keyTypesLabel.text": "Key Types",
    "DOCS_PAGE.publishableLabel.text": "Publishable",
    "DOCS_PAGE.publishableFeature1.text": "Safe for client-side code",
    "DOCS_PAGE.publishableFeature2.text":
        "Rate limited: 3 req/burst, 1/15sec refill",
    "DOCS_PAGE.publishableFeature3.text":
        "Best for: demos, prototypes, public tools",
    "DOCS_PAGE.secretLabel.text": "Secret",
    "DOCS_PAGE.secretFeature1.text": "Server-side only",
    "DOCS_PAGE.secretFeature2.text": "Never expose publicly",
    "DOCS_PAGE.secretFeature3.text": "No rate limits, can spend Pollen",
    "DOCS_PAGE.getYourKeyLabel.text": "Get Your Key",
    "DOCS_PAGE.usageExamplesLabel.text": "Usage Examples",
    "DOCS_PAGE.serverSideDescription.text":
        "Server-side (Recommended): Use secret key in Authorization header",
    "DOCS_PAGE.clientSideDescription.text":
        "Client-side (Public): Use publishable key in query parameter",
    "DOCS_PAGE.apiBaseUrl.text": "gen.pollinations.ai",
    "HELLO_PAGE.heroTitle.text": "Open-source AI for builders.",
    "HELLO_PAGE.heroIntro.text":
        "A community-driven platform where developers, artists, and tinkerers build together. No gatekeeping, no corporate nonsense — just good tools and good people.",
    "HELLO_PAGE.heroTagline.text":
        "APIs built in the open. Loved by developers. Powered by community.",
    "HELLO_PAGE.whatIsTitle.text": "What Pollinations Is",
    "HELLO_PAGE.whatIsDescription.text":
        "Pollinations is an open-source AI platform built by and for the community. We offer a unified API for images, text, audio, and video. Everything runs in the open: our code, our roadmap, our conversations. Hundreds of developers are already building tools, games, bots, and weird experiments with us. You're welcome to join.",
    "HELLO_PAGE.whatIsTagline.text":
        "No black boxes. No vendor lock-in. Just a friendly API and a Discord full of people who actually help each other.",
    "HELLO_PAGE.pollenTitle.text": "Pollen",
    "HELLO_PAGE.pollenDescription.text":
        "Running AI models costs money. Pollen is how we keep the servers humming without ads or selling your data. One simple credit across all models — predictable, transparent, no surprises.",
    "HELLO_PAGE.getPollenTitle.text": "How to Get Pollen",
    "HELLO_PAGE.getPollenIntro.text": "Two main paths:",
    "HELLO_PAGE.buyCardTitle.text": "Buy Pollen",
    "HELLO_PAGE.buyCardDescription.text":
        "Add Pollen to your wallet and build. Straightforward packs, no subscriptions, no locked-in tiers.",
    "HELLO_PAGE.buyCardPromo.text": "🎁 Buy 1, get 1 free during beta!",
    "HELLO_PAGE.earnCardTitle.text": "Contribute & Get Pollen",
    "HELLO_PAGE.earnCardDescription.text":
        "Ship an app, help in Discord, fix bugs, improve docs — every contribution earns you Pollen. We notice and we share.",
    "HELLO_PAGE.tiersSubtitle.text": "Grow",
    "HELLO_PAGE.tiersDescription.text":
        "Start small, contribute, watch your Pollen grow:",
    "HELLO_PAGE.tierSporeTitle.text": "Spore — Just arrived",
    "HELLO_PAGE.tierSporeDescription.text":
        "Welcome! Here's some Pollen to play with.",
    "HELLO_PAGE.tierSeedTitle.text": "Seed — Part of the community",
    "HELLO_PAGE.tierSeedDescription.text":
        "You're on GitHub or Discord, you've said hi. More Pollen for you.",
    "HELLO_PAGE.tierFlowerTitle.text": "Flower — You shipped something",
    "HELLO_PAGE.tierFlowerDescription.text":
        "You built an app with Pollinations. Nice! Even more Pollen.",
    "HELLO_PAGE.tierNectarTitle.text": "Nectar — Community pillar",
    "HELLO_PAGE.tierNectarDescription.text":
        "Your work helps others. You're part of what makes this place good.",
    "HELLO_PAGE.questsSubtitle.text": "Ways to Contribute",
    "HELLO_PAGE.questsDescription.text":
        "Fix a bug, answer a question, share what you built, improve the docs. Every contribution matters and gets recognized.",
    "HELLO_PAGE.questsStatus.text": "New",
    "HELLO_PAGE.buildTitle.text": "What People Build",
    "HELLO_PAGE.buildIntro.text": "Some things the community has made:",
    "HELLO_PAGE.buildFeature1.text": "Chatbots and agents with memory",
    "HELLO_PAGE.buildFeature2.text":
        "Visual worlds with consistent characters and assets",
    "HELLO_PAGE.buildFeature3.text":
        "Multi-step workflows for research, summarization, and creation",
    "HELLO_PAGE.buildFeature4.text":
        "Interactive media and new modalities (video, audio, and more — coming soon)",
    "HELLO_PAGE.whyChooseTitle.text": "Why Developers Choose Pollinations",
    "HELLO_PAGE.whyChooseIntro.text":
        "You get a platform that cares about aesthetics and ergonomics as much as raw capability.",
    "HELLO_PAGE.whyChooseFeature1.text":
        "Beautiful Dev Experience — clean APIs, thoughtful defaults, and friendly docs.",
    "HELLO_PAGE.whyChooseFeature2.text":
        "Unified API — work with multiple models and modalities through one place.",
    "HELLO_PAGE.whyChooseFeature3.text":
        "No BS Pricing — Pollen is simple and transparent. You always know what you're paying.",
    "HELLO_PAGE.whyChooseFeature4.text":
        "Community-Driven — the roadmap comes from Discord conversations, not boardrooms.",
    "HELLO_PAGE.whyChooseFeature5.text":
        "Fully Open Source — every line of code is on GitHub. Fork it, read it, improve it.",
    "HELLO_PAGE.communityTitle.text": "Built Together",
    "HELLO_PAGE.communityDescription.text":
        "Students, indie devs, artists, researchers, hobbyists — all building weird and wonderful things together. Jump into Discord, browse the GitHub, see what people are making. This is a place where people actually help each other.",
    "HELLO_PAGE.roadmapTitle.text": "What's Next",
    "HELLO_PAGE.roadmapIntro.text": "Here's what we're working on:",
    "HELLO_PAGE.roadmapItem1Title.text": "Frontend Auth",
    "HELLO_PAGE.roadmapItem1Description.text":
        "Call the API from the browser — no backend needed.",
    "HELLO_PAGE.roadmapItem2Title.text": "User Pollen",
    "HELLO_PAGE.roadmapItem2Description.text":
        "Your users bring their own Pollen. You build, they pay for what they use.",
    "HELLO_PAGE.roadmapItem3Title.text": "App Hosting & Discovery",
    "HELLO_PAGE.roadmapItem3Description.text":
        "Ship your app and make it easy to find.",
    "HELLO_PAGE.roadmapItem4Title.text": "More Models, More Modalities",
    "HELLO_PAGE.roadmapItem4Description.text":
        "Video, real-time, and whatever comes next.",
    "HELLO_PAGE.ctaTitle.text": "Ready to Create?",
    "HELLO_PAGE.ctaDescription.text":
        "Start building with tools that feel good to use.",
    "HELLO_PAGE.getApiKeyButton.text": "Get Your API Key",
    "HELLO_PAGE.startCreatingButton.text": "Start Creating",
    "HELLO_PAGE.joinCommunityButton.text": "Join the Community",
    "HELLO_PAGE.viewPricingButton.text": "View Pricing",
    "HELLO_PAGE.exploreTiersButton.text": "Learn More About Tiers",
    "HELLO_PAGE.seeAppsButton.text": "See Featured Apps",
    "PLAY_PAGE.createTitle.text": "Create",
    "PLAY_PAGE.watchTitle.text": "Watch",
    "PLAY_PAGE.createDescription.text":
        "Test our API, play with different models, and see what you can create. This is a fun demo playground—not our main product, just a place to explore and experiment.",
    "PLAY_PAGE.feedDescription.text":
        "Watch the global pulse of our network in real-time. See what the community is creating right now through our APIs.",
    "PLAY_PAGE.toggleWatchOthers.text": "Watch what others are making",
    "PLAY_PAGE.toggleBackToPlay.text": "Back to Play",
    "PLAY_PAGE.modelsLabel.text": "Models",
    "PLAY_PAGE.imageLabel.text": "Image",
    "PLAY_PAGE.textLabel.text": "Text",
    "PLAY_PAGE.promptLabel.text": "Prompt",
    "PLAY_PAGE.imagePlaceholder.text": "Describe the image you want...",
    "PLAY_PAGE.textPlaceholder.text": "Enter your question or prompt...",
    "PLAY_PAGE.addImagesLabel.text": "Add Images (Optional)",
    "PLAY_PAGE.upToFourLabel.text": "up to 4",
    "PLAY_PAGE.widthLabel.text": "Width",
    "PLAY_PAGE.heightLabel.text": "Height",
    "PLAY_PAGE.seedLabel.text": "Seed",
    "PLAY_PAGE.seedPlaceholder.text": "0 = random",
    "PLAY_PAGE.enhanceLabel.text": "Enhance",
    "PLAY_PAGE.logoLabel.text": "Logo",
    "PLAY_PAGE.generatingText.text": "Generating...",
    "PLAY_PAGE.generateImageButton.text": "Generate Image",
    "PLAY_PAGE.generateTextButton.text": "Generate Text",
    "LINKS.discordPollenBeta":
        "https://discord.com/channels/885844321461485618/1432378056126894343",
    "LINKS.githubSubmitApp":
        "https://github.com/pollinations/pollinations/issues/new?template=tier-app-submission.yml",
    "SOCIAL_LINKS.discord.label": "Discord",
    "SOCIAL_LINKS.discord.url":
        "https://discord.gg/pollinations-ai-885844321461485618",
    "SOCIAL_LINKS.discord.width": "32px",
    "SOCIAL_LINKS.discord.height": "32px",
    "SOCIAL_LINKS.github.label": "GitHub",
    "SOCIAL_LINKS.github.url":
        "https://www.github.com/pollinations/pollinations",
    "SOCIAL_LINKS.github.width": "25px",
    "SOCIAL_LINKS.github.height": "25px",
    "SOCIAL_LINKS.linkedin.label": "LinkedIn",
    "SOCIAL_LINKS.linkedin.url":
        "https://www.linkedin.com/company/pollinations-ai",
    "SOCIAL_LINKS.linkedin.width": "22px",
    "SOCIAL_LINKS.linkedin.height": "22px",
    "SOCIAL_LINKS.instagram.label": "Instagram",
    "SOCIAL_LINKS.instagram.url": "https://instagram.com/pollinations_ai",
    "SOCIAL_LINKS.instagram.width": "22px",
    "SOCIAL_LINKS.instagram.height": "22px",
    "SOCIAL_LINKS.x.label": "X",
    "SOCIAL_LINKS.x.url": "https://twitter.com/pollinations_ai",
    "SOCIAL_LINKS.x.width": "20px",
    "SOCIAL_LINKS.x.height": "20px",
    "SOCIAL_LINKS.youtube.label": "YouTube",
    "SOCIAL_LINKS.youtube.url": "https://www.youtube.com/c/pollinations",
    "SOCIAL_LINKS.youtube.width": "28px",
    "SOCIAL_LINKS.youtube.height": "28px",
    "SOCIAL_LINKS.tiktok.label": "Tiktok",
    "SOCIAL_LINKS.tiktok.url": "https://tiktok.com/@pollinations.ai",
    "SOCIAL_LINKS.tiktok.width": "27px",
    "SOCIAL_LINKS.tiktok.height": "27px",
    "SOCIAL_LINKS.reddit.label": "Reddit",
    "SOCIAL_LINKS.reddit.url": "https://www.reddit.com/r/pollinations/",
    "SOCIAL_LINKS.reddit.width": "24px",
    "SOCIAL_LINKS.reddit.height": "24px",
};

// Background HTML (raw template literal)
export const GrayscaleMinimalBackgroundHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>The Living Web</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            overflow: hidden;
            background-color: {{BACKGROUND_BASE}};
            font-family: 'Inter', sans-serif;
        }
        canvas {
            display: block;
        }
        #label {
            position: fixed;
            bottom: 20px;
            right: 20px;
            color: {{BACKGROUND_ELEMENT2}};
            font-size: 10px;
            letter-spacing: 0.1em;
            text-transform: uppercase;
            opacity: 0.5;
            pointer-events: none;
            user-select: none;
        }
    </style>
</head>
<body>
    <div id="label">pollinations.ai background</div>
    <script type="module">
        import * as THREE from 'https://esm.sh/three';

        const COLORS = {
            sceneBackground: '{{BACKGROUND_BASE}}',
            filaments: '{{BACKGROUND_ELEMENT1}}',
            nodes: '{{BACKGROUND_ELEMENT2}}',
            particles: '{{BACKGROUND_PARTICLE}}'
        };

        let scene, camera, renderer, clock;
        let nodeGroup, connectionLines, particleSystem;
        const nodeCount = 40;
        const nodes = [];
        const connections = [];
        const maxDistance = 4;
        
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        init();

        function init() {
            scene = new THREE.Scene();
            scene.background = new THREE.Color(COLORS.sceneBackground);

            camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
            camera.position.z = 10;

            initRenderer();
            createOrganicElements();
            
            clock = new THREE.Clock();

            window.addEventListener('resize', onWindowResize);
            requestAnimationFrame(animate);
        }

        function initRenderer() {
            renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            renderer.setSize(window.innerWidth, window.innerHeight);
            document.body.appendChild(renderer.domElement);
        }

        function createOrganicElements() {
            nodeGroup = new THREE.Group();
            scene.add(nodeGroup);

            // Create Nodes
            const nodeGeo = new THREE.SphereGeometry(0.04, 8, 8);
            const nodeMat = new THREE.MeshBasicMaterial({ 
                color: COLORS.nodes,
                transparent: true,
                opacity: 0.6,
                depthWrite: false
            });

            for (let i = 0; i < nodeCount; i++) {
                const mesh = new THREE.Mesh(nodeGeo, nodeMat);
                const origin = new THREE.Vector3(
                    (Math.random() - 0.5) * 15,
                    (Math.random() - 0.5) * 15,
                    (Math.random() - 0.5) * 10
                );
                mesh.position.copy(origin);
                
                nodes.push({
                    mesh: mesh,
                    origin: origin,
                    phase: Math.random() * Math.PI * 2,
                    speed: 0.2 + Math.random() * 0.3
                });
                nodeGroup.add(mesh);
            }

            // Create Connections (Filaments)
            const lineMat = new THREE.LineBasicMaterial({ 
                color: COLORS.filaments, 
                transparent: true, 
                opacity: 0.2,
                depthWrite: false
            });
            const lineGeo = new THREE.BufferGeometry();
            // Pre-allocate buffer for potential connections (worst case n*n, but we'll use a subset)
            const positions = new Float32Array(nodeCount * nodeCount * 6); 
            lineGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            connectionLines = new THREE.LineSegments(lineGeo, lineMat);
            scene.add(connectionLines);

            // Create Floating Particles (Spores)
            const particleCount = 120;
            const particleGeo = new THREE.BufferGeometry();
            const particlePositions = new Float32Array(particleCount * 3);
            const particleData = [];

            for (let i = 0; i < particleCount; i++) {
                const x = (Math.random() - 0.5) * 20;
                const y = (Math.random() - 0.5) * 20;
                const z = (Math.random() - 0.5) * 20;
                particlePositions[i * 3] = x;
                particlePositions[i * 3 + 1] = y;
                particlePositions[i * 3 + 2] = z;
                
                particleData.push({
                    origin: new THREE.Vector3(x, y, z),
                    speed: 0.1 + Math.random() * 0.2,
                    offset: Math.random() * 100
                });
            }

            particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
            const particleMat = new THREE.PointsMaterial({
                color: COLORS.particles,
                size: 0.03,
                transparent: true,
                opacity: 0.4,
                depthWrite: false
            });
            particleSystem = new THREE.Points(particleGeo, particleMat);
            scene.add(particleSystem);
            
            particleSystem.userData = { data: particleData };
        }

        function onWindowResize() {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }

        function animate(time) {
            if (!time) time = performance.now();
            requestAnimationFrame(animate);

            const delta = clock.getElapsedTime();
            const motionFactor = prefersReducedMotion ? 0.05 : 1.0;

            // Animate Nodes
            nodes.forEach((node, i) => {
                const shiftX = Math.sin(delta * node.speed + node.phase) * 0.5 * motionFactor;
                const shiftY = Math.cos(delta * node.speed * 0.8 + node.phase) * 0.5 * motionFactor;
                const shiftZ = Math.sin(delta * node.speed * 1.2 + node.phase) * 0.5 * motionFactor;
                
                node.mesh.position.set(
                    node.origin.x + shiftX,
                    node.origin.y + shiftY,
                    node.origin.z + shiftZ
                );
            });

            // Update Filaments
            const linePosAttr = connectionLines.geometry.attributes.position;
            let lineIdx = 0;
            for (let i = 0; i < nodeCount; i++) {
                for (let j = i + 1; j < nodeCount; j++) {
                    const dist = nodes[i].mesh.position.distanceTo(nodes[j].mesh.position);
                    if (dist < maxDistance) {
                        linePosAttr.setXYZ(lineIdx++, nodes[i].mesh.position.x, nodes[i].mesh.position.y, nodes[i].mesh.position.z);
                        linePosAttr.setXYZ(lineIdx++, nodes[j].mesh.position.x, nodes[j].mesh.position.y, nodes[j].mesh.position.z);
                    }
                }
            }
            linePosAttr.needsUpdate = true;
            connectionLines.geometry.setDrawRange(0, lineIdx);

            // Animate Particles
            const pPosAttr = particleSystem.geometry.attributes.position;
            const pData = particleSystem.userData.data;
            for (let i = 0; i < pData.length; i++) {
                const d = pData[i];
                const drift = Math.sin(delta * d.speed + d.offset) * 0.2 * motionFactor;
                pPosAttr.setXYZ(
                    i, 
                    d.origin.x + drift, 
                    d.origin.y + (delta * d.speed * motionFactor) % 10 - 5, 
                    d.origin.z + drift
                );
            }
            pPosAttr.needsUpdate = true;

            // Gentle Camera Drift
            if (!prefersReducedMotion) {
                camera.position.x = Math.sin(delta * 0.1) * 1.5;
                camera.position.y = Math.cos(delta * 0.15) * 1.5;
                camera.lookAt(0, 0, 0);
            }

            renderer.render(scene, camera);
        }
    </script>
</body>
</html>`;
