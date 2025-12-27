import { type LLMThemeResponse, processTheme } from "../style/theme-processor";

export const CrazyDreamsTheme: LLMThemeResponse = {
    "slots": {
        "slot_0": {
            "hex": "#FFFFFF",
            "ids": ["text.primary", "input.text"],
        },
        "slot_1": {
            "hex": "#E0B0FF",
            "ids": ["text.secondary"],
        },
        "slot_2": {
            "hex": "#C71585",
            "ids": ["input.border", "border.main"],
        },
        "slot_3": {
            "hex": "#7B68EE",
            "ids": ["input.placeholder"],
        },
        "slot_4": {
            "hex": "#4B0082",
            "ids": ["button.secondary.bg", "border.subtle"],
        },
        "slot_5": {
            "hex": "#2E1A47",
            "ids": ["button.disabled.bg", "border.faint"],
        },
        "slot_6": {
            "hex": "#00FFFF",
            "ids": ["indicator.image", "background.particle"],
        },
        "slot_7": {
            "hex": "#FFD700",
            "ids": ["indicator.audio"],
        },
        "slot_8": {
            "hex": "#FF1493",
            "ids": ["border.strong"],
        },
        "slot_9": {
            "hex": "#B19CD9",
            "ids": ["text.tertiary"],
        },
        "slot_10": {
            "hex": "#8A2BE2",
            "ids": ["text.caption", "button.secondary.border"],
        },
        "slot_11": {
            "hex": "#0D0221",
            "ids": ["text.inverse", "surface.page", "background.base"],
        },
        "slot_12": {
            "hex": "#FF00FF",
            "ids": [
                "text.brand",
                "button.primary.bg",
                "button.primary.border",
                "indicator.text",
                "border.brand",
                "logo.main",
                "background.element1",
            ],
        },
        "slot_13": {
            "hex": "#39FF14",
            "ids": [
                "text.highlight",
                "button.focus.ring",
                "indicator.video",
                "border.highlight",
                "logo.accent",
                "background.element2",
            ],
        },
        "slot_14": {
            "hex": "#1A0B2E",
            "ids": ["surface.card"],
        },
        "slot_15": {
            "hex": "#120524",
            "ids": ["surface.base"],
        },
        "slot_16": {
            "hex": "#240B36",
            "ids": ["input.bg"],
        },
    },
    "borderRadius": {
        "radius.button": "24px",
        "radius.card": "32px",
    },
    "fonts": {
        "font.title": "Syne",
        "font.headline": "Space Grotesk",
        "font.body": "Outfit",
    },
    "opacity": {
        "opacity.card": "0.85",
        "opacity.overlay": "0.9",
        "opacity.glass": "0.7",
    },
};

export const CrazyDreamsCssVariables =
    processTheme(CrazyDreamsTheme).cssVariables;

// Copy from: "crazy dreams"
export const CrazyDreamsCopy = {
    "APPS_PAGE.title.text": "Ecosystem",
    "APPS_PAGE.subtitle.text":
        "Paradise-built apps, tools, and experiments—Pollinations-powered. Browse, try, ship.",
    "COMMUNITY_PAGE.title.text": "Contribute",
    "COMMUNITY_PAGE.subtitle.text":
        "We're crafting a haven where developers, creators, and AI enthusiasts collaborate and bloom together.",
    "COMMUNITY_PAGE.newsTitle.text": "What's New",
    "COMMUNITY_PAGE.newsFilePath":
        "https://raw.githubusercontent.com/pollinations/pollinations/production/NEWS/transformed/highlights.md",
    "COMMUNITY_PAGE.discordTitle.text": "Discord",
    "COMMUNITY_PAGE.discordSubtitle.text":
        "Join our sunlit community for chats and support.",
    "COMMUNITY_PAGE.githubTitle.text": "GitHub",
    "COMMUNITY_PAGE.githubSubtitle.text":
        "Collaborate on open-source projects and contribute code.",
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
        "We're grateful to our supporters for their contributions to the platform.",
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
    "DOCS_PAGE.imageParameters.4.key": "safe",
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
    "DOCS_PAGE.publishableLabel.text": "Publishable (Alpha)",
    "DOCS_PAGE.publishableFeature1.text": "⚠️ Alpha – not production-ready",
    "DOCS_PAGE.publishableFeature2.text": "1 pollen/hour per IP+key",
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
    "HELLO_PAGE.heroTitle.text": "Open-source AI for people who make things.",
    "HELLO_PAGE.heroIntro.text":
        "A community-driven platform where developers, artists, and tinkerers build together. No gatekeeping, no corporate nonsense — just good tools and good people.",
    "HELLO_PAGE.heroTagline.text":
        "APIs built in the open. Loved by developers. Powered by community.",
    "HELLO_PAGE.whatIsTitle.text": "What Pollinations Is",
    "HELLO_PAGE.whatIsDescription.text":
        "Pollinations is an open-source AI platform built by and for the community. We offer a unified API for images, text, and audio — with video on the way. Everything runs in the open: our code, our roadmap, our conversations. Hundreds of developers are already building tools, games, bots, and weird experiments with us. You're welcome to join.",
    "HELLO_PAGE.whatIsTagline.text":
        "No black boxes. No vendor lock-in. Just a friendly API and a Discord full of people who actually help each other.",
    "HELLO_PAGE.pollenTitle.text": "Pollen",
    "HELLO_PAGE.pollenDescription.text":
        "Running AI models costs money. Pollen is how we keep the servers humming without ads or selling your data. One simple credit across all models — predictable, transparent, no surprises. Two ways to get it:",
    "HELLO_PAGE.getPollenTitle.text": "How to Get Pollen",
    "HELLO_PAGE.getPollenIntro.text": "Two main paths:",
    "HELLO_PAGE.buyCardTitle.text": "Support the Project",
    "HELLO_PAGE.buyCardDescription.text":
        "Grab some Pollen and help keep Pollinations running. No subscriptions, no tricks — just straightforward support.",
    "HELLO_PAGE.earnCardTitle.text": "Contribute & Get Pollen",
    "HELLO_PAGE.earnCardDescription.text":
        "Active community members get free Pollen. Ship an app, help others in Discord, fix a bug, write docs — we notice and we share.",
    "HELLO_PAGE.tiersSubtitle.text": "Grow",
    "HELLO_PAGE.tiersDescription.text":
        "Start small, contribute, watch your Pollen grow:",
    "HELLO_PAGE.tierSporeTitle.text": "🦠 Spore — Just arrived",
    "HELLO_PAGE.tierSporeDescription.text":
        "Welcome! Here's some Pollen to play with.",
    "HELLO_PAGE.tierSeedTitle.text": "🌱 Seed — Part of the community",
    "HELLO_PAGE.tierSeedDescription.text":
        "You're on GitHub or Discord, you've said hi. More Pollen for you.",
    "HELLO_PAGE.tierFlowerTitle.text": "🌸 Flower — You shipped something",
    "HELLO_PAGE.tierFlowerDescription.text":
        "You built an app with Pollinations. Nice! Even more Pollen.",
    "HELLO_PAGE.tierNectarTitle.text": "🍯 Nectar — Community pillar",
    "HELLO_PAGE.tierNectarDescription.text":
        "Your work helps others. You're part of what makes this place good.",
    "HELLO_PAGE.questsSubtitle.text": "Ways to Contribute",
    "HELLO_PAGE.questsDescription.text":
        "Fix a bug, answer a question, share what you built, improve the docs. Every contribution matters and gets recognized.",
    "HELLO_PAGE.questsStatus.text": "Coming soon",
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
};

// Background HTML (raw template literal)
export const CrazyDreamsBackgroundHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>The Living Web: Crazy Dreams</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            overflow: hidden;
            background-color: {{BACKGROUND_BASE}};
            font-family: sans-serif;
        }
        canvas {
            display: block;
            width: 100vw;
            height: 100vh;
        }
        #overlay {
            position: absolute;
            bottom: 10px;
            right: 15px;
            color: {{BACKGROUND_PARTICLE}};
            font-size: 10px;
            letter-spacing: 1px;
            opacity: 0.4;
            pointer-events: none;
            text-transform: uppercase;
        }
    </style>
</head>
<body>
    <div id="overlay">pollinations.ai background</div>
    <script type="module">
        import * as THREE from 'https://esm.sh/three';

        const COLORS = {
            sceneBackground: '{{BACKGROUND_BASE}}',
            filaments: '{{BACKGROUND_ELEMENT1}}',
            nodes: '{{BACKGROUND_ELEMENT2}}',
            particles: '{{BACKGROUND_PARTICLE}}'
        };

        let scene, camera, renderer, clock;
        let filamentLines, nodeGroup, particleSystem;
        let prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        const PARAMS = {
            nodeCount: 40,
            particleCount: 150,
            connectionMaxDist: 18,
            driftSpeed: 0.15,
            pulseSpeed: 0.8
        };

        function init() {
            scene = new THREE.Scene();
            scene.background = new THREE.Color(COLORS.sceneBackground);

            camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
            camera.position.z = 40;

            initRenderer();
            createOrganicElements();
            
            clock = new THREE.Clock();
            window.addEventListener('resize', onWindowResize);
            
            animate();
        }

        function initRenderer() {
            renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
            renderer.setPixelRatio(window.devicePixelRatio);
            renderer.setSize(window.innerWidth, window.innerHeight);
            document.body.appendChild(renderer.domElement);
        }

        function createOrganicElements() {
            // Create Nodes (the Dream Junctions)
            nodeGroup = new THREE.Group();
            const nodeGeom = new THREE.SphereGeometry(0.2, 8, 8);
            const nodeMat = new THREE.MeshBasicMaterial({ 
                color: COLORS.nodes,
                transparent: true,
                opacity: 0.7,
                depthWrite: false
            });

            const positions = [];
            const originalPositions = [];

            for (let i = 0; i < PARAMS.nodeCount; i++) {
                const pos = new THREE.Vector3(
                    (Math.random() - 0.5) * 50,
                    (Math.random() - 0.5) * 30,
                    (Math.random() - 0.5) * 20
                );
                positions.push(pos);
                originalPositions.push(pos.clone());

                const mesh = new THREE.Mesh(nodeGeom, nodeMat);
                mesh.position.copy(pos);
                // Store metadata for animation
                mesh.userData.origin = pos.clone();
                mesh.userData.phase = Math.random() * Math.PI * 2;
                nodeGroup.add(mesh);
            }
            scene.add(nodeGroup);

            // Create Filaments (the Connections)
            // We use LineSegments for efficiency
            const lineMaterial = new THREE.LineBasicMaterial({ 
                color: COLORS.filaments, 
                transparent: true, 
                opacity: 0.2,
                depthWrite: false
            });
            
            // Max possible connections is nodeCount^2, but we'll prune based on distance
            const lineGeometry = new THREE.BufferGeometry();
            // Buffer size is fixed to avoid reallocating
            const maxConnections = PARAMS.nodeCount * 4; 
            lineGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxConnections * 2 * 3), 3));
            filamentLines = new THREE.LineSegments(lineGeometry, lineMaterial);
            scene.add(filamentLines);

            // Create Particles (the Spores/Dust)
            const partGeom = new THREE.BufferGeometry();
            const partPos = new Float32Array(PARAMS.particleCount * 3);
            const partOrigins = new Float32Array(PARAMS.particleCount * 3);
            
            for (let i = 0; i < PARAMS.particleCount; i++) {
                const x = (Math.random() - 0.5) * 80;
                const y = (Math.random() - 0.5) * 50;
                const z = (Math.random() - 0.5) * 40;
                partPos[i * 3] = x;
                partPos[i * 3 + 1] = y;
                partPos[i * 3 + 2] = z;
                partOrigins[i * 3] = x;
                partOrigins[i * 3 + 1] = y;
                partOrigins[i * 3 + 2] = z;
            }
            
            partGeom.setAttribute('position', new THREE.BufferAttribute(partPos, 3));
            partGeom.setAttribute('origin', new THREE.BufferAttribute(partOrigins, 3));
            
            const partMat = new THREE.PointsMaterial({
                color: COLORS.particles,
                size: 0.15,
                transparent: true,
                opacity: 0.4,
                depthWrite: false
            });
            
            particleSystem = new THREE.Points(partGeom, partMat);
            scene.add(particleSystem);
        }

        function updateWeb(time) {
            const nodes = nodeGroup.children;
            const linePosAttr = filamentLines.geometry.attributes.position;
            let lineIdx = 0;

            // Update Node positions with a subtle dream-like drift
            nodes.forEach((node, i) => {
                if (!prefersReducedMotion) {
                    const phase = node.userData.phase;
                    const driftX = Math.sin(time * PARAMS.driftSpeed + phase) * 2;
                    const driftY = Math.cos(time * PARAMS.driftSpeed * 0.7 + phase) * 2;
                    const driftZ = Math.sin(time * PARAMS.driftSpeed * 1.2 + phase) * 1.5;
                    
                    node.position.copy(node.userData.origin).add(new THREE.Vector3(driftX, driftY, driftZ));
                    
                    // Pulse scale
                    const scale = 1 + Math.sin(time * PARAMS.pulseSpeed + phase) * 0.3;
                    node.scale.set(scale, scale, scale);
                }
            });

            // Update Filament connections
            for (let i = 0; i < nodes.length; i++) {
                for (let j = i + 1; j < nodes.length; j++) {
                    const dist = nodes[i].position.distanceTo(nodes[j].position);
                    if (dist < PARAMS.connectionMaxDist && lineIdx < linePosAttr.count - 2) {
                        linePosAttr.setXYZ(lineIdx++, nodes[i].position.x, nodes[i].position.y, nodes[i].position.z);
                        linePosAttr.setXYZ(lineIdx++, nodes[j].position.x, nodes[j].position.y, nodes[j].position.z);
                    }
                }
            }
            
            // Clear remaining points in buffer
            for (let k = lineIdx; k < linePosAttr.count; k++) {
                linePosAttr.setXYZ(k, 0, 0, 0);
            }
            linePosAttr.needsUpdate = true;
        }

        function updateParticles(time) {
            if (prefersReducedMotion) return;
            
            const positions = particleSystem.geometry.attributes.position.array;
            const origins = particleSystem.geometry.attributes.origin.array;
            
            for (let i = 0; i < PARAMS.particleCount; i++) {
                const i3 = i * 3;
                // Slow floating motion
                positions[i3] = origins[i3] + Math.sin(time * 0.2 + origins[i3]) * 3;
                positions[i3 + 1] = origins[i3 + 1] + Math.cos(time * 0.15 + origins[i3 + 1]) * 3;
                positions[i3 + 2] = origins[i3 + 2] + Math.sin(time * 0.3 + origins[i3 + 2]) * 2;
            }
            particleSystem.geometry.attributes.position.needsUpdate = true;
        }

        function onWindowResize() {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }

        function animate() {
            requestAnimationFrame(animate);
            
            let time = clock.getElapsedTime();
            if (!time) time = performance.now() * 0.001;

            updateWeb(time);
            updateParticles(time);

            // Gentle camera drift
            if (!prefersReducedMotion) {
                camera.position.x = Math.sin(time * 0.1) * 3;
                camera.position.y = Math.cos(time * 0.15) * 2;
                camera.lookAt(0, 0, 0);
            }

            renderer.render(scene, camera);
        }

        init();
    </script>
</body>
</html>`;
