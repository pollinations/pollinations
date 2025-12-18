import { LLMThemeResponse, processTheme } from "../style/theme-processor";

export const GayPrideLgbtqTheme: LLMThemeResponse = {
    "slots": {
        "slot_0": {
            "hex": "#F8F8FF",
            "ids": ["text.primary"],
        },
        "slot_1": {
            "hex": "#E0D4F7",
            "ids": ["text.secondary"],
        },
        "slot_2": {
            "hex": "#25103D",
            "ids": ["input.bg"],
        },
        "slot_3": {
            "hex": "#4A2C69",
            "ids": ["input.border"],
        },
        "slot_4": {
            "hex": "#9575CD",
            "ids": ["input.placeholder"],
        },
        "slot_5": {
            "hex": "#FFFFFF",
            "ids": ["input.text", "logo.main"],
        },
        "slot_6": {
            "hex": "#2D1B4E",
            "ids": ["button.secondary.bg"],
        },
        "slot_7": {
            "hex": "#00E5FF",
            "ids": [
                "button.secondary.border",
                "indicator.text",
                "logo.accent",
                "background.element2",
            ],
        },
        "slot_8": {
            "hex": "#2C2C2C",
            "ids": ["button.disabled.bg"],
        },
        "slot_9": {
            "hex": "#FFD700",
            "ids": ["button.focus.ring", "background.particle"],
        },
        "slot_10": {
            "hex": "#B39DDB",
            "ids": ["text.tertiary"],
        },
        "slot_11": {
            "hex": "#FF9100",
            "ids": ["indicator.image"],
        },
        "slot_12": {
            "hex": "#D500F9",
            "ids": ["indicator.audio"],
        },
        "slot_25": {
            "hex": "#00FF7F",
            "ids": ["indicator.video"],
        },
        "slot_13": {
            "hex": "#FF00CC",
            "ids": ["border.highlight"],
        },
        "slot_14": {
            "hex": "#5E35B1",
            "ids": ["border.main"],
        },
        "slot_15": {
            "hex": "#7B1FA2",
            "ids": ["border.strong"],
        },
        "slot_16": {
            "hex": "#311B92",
            "ids": ["border.subtle"],
        },
        "slot_17": {
            "hex": "#231042",
            "ids": ["border.faint"],
        },
        "slot_18": {
            "hex": "#9FA8DA",
            "ids": ["text.caption"],
        },
        "slot_19": {
            "hex": "#120524",
            "ids": ["text.inverse"],
        },
        "slot_20": {
            "hex": "#FF0055",
            "ids": [
                "text.brand",
                "button.primary.bg",
                "button.primary.border",
                "border.brand",
                "background.element1",
            ],
        },
        "slot_21": {
            "hex": "#FF4081",
            "ids": ["text.highlight"],
        },
        "slot_22": {
            "hex": "#0D0212",
            "ids": ["surface.page", "background.base"],
        },
        "slot_23": {
            "hex": "#1A0B2E",
            "ids": ["surface.card"],
        },
        "slot_24": {
            "hex": "#08020D",
            "ids": ["surface.base"],
        },
    },
    "borderRadius": {
        "radius.button": "24px",
        "radius.card": "20px",
    },
    "fonts": {
        "font.title": "Comfortaa",
        "font.headline": "Work Sans",
        "font.body": "Mulish",
    },
    "opacity": {
        "opacity.card": "0.9",
        "opacity.overlay": "0.85",
        "opacity.glass": "0.7",
    },
};

export const GayPrideLgbtqCssVariables =
    processTheme(GayPrideLgbtqTheme).cssVariables;

// Copy from: "gay pride lgbtq"
export const GayPrideLgbtqCopy = {
    "APPS_PAGE.title.text": "Ecosystem",
    "APPS_PAGE.subtitle.text":
        "Paradise-built apps, tools, and experiments—Pollinations-powered. Browse, try, ship.",
    "COMMUNITY_PAGE.title.text": "Contribute",
    "COMMUNITY_PAGE.subtitle.text":
        "We're crafting a haven where developers, creators, and AI enthusiasts collaborate and bloom together.",
    "COMMUNITY_PAGE.newsTitle.text": "What's New",
    "COMMUNITY_PAGE.newsFilePath": "/NEWS.md",
    "COMMUNITY_PAGE.discordTitle.text": "Discord",
    "COMMUNITY_PAGE.discordSubtitle.text":
        "Join our sunlit community for chats and support.",
    "COMMUNITY_PAGE.githubTitle.text": "GitHub",
    "COMMUNITY_PAGE.githubSubtitle.text":
        "Collaborate on open-source projects and contribute code.",
    "COMMUNITY_PAGE.joinDiscordButton.text": "Join Discord",
    "COMMUNITY_PAGE.contributeButton.text": "Contribute",
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
    "DOCS_PAGE.optionalParametersLabel.text": "Optional parameters",
    "DOCS_PAGE.generatingLabel.text": "Generating...",
    "DOCS_PAGE.copyUrlButton.text": "Copy URL",
    "DOCS_PAGE.imagePrompts.0": "a blooming flower in golden hour",
    "DOCS_PAGE.imagePrompts.1": "bees pollinating wildflowers",
    "DOCS_PAGE.imagePrompts.2": "organic mycelium network patterns",
    "DOCS_PAGE.imagePrompts.3": "harmonious forest ecosystem",
    "DOCS_PAGE.imagePrompts.4": "symbiotic nature interactions",
    "DOCS_PAGE.imagePrompts.5": "flowing river through biosphere",
    "DOCS_PAGE.textGenerationTitle.text": "Text Generation",
    "DOCS_PAGE.modelLabel.text": "Model",
    "DOCS_PAGE.defaultModelLabel.text": "Default: openai",
    "DOCS_PAGE.optionalLabel.text": "Optional",
    "DOCS_PAGE.textPrompts.0": "explain pollinations.ai",
    "DOCS_PAGE.textPrompts.1": "write a poem about nature",
    "DOCS_PAGE.textPrompts.2": "describe ecosystem harmony",
    "DOCS_PAGE.textPrompts.3": "explain symbiosis",
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
    "DOCS_PAGE.publishableFeature2.text": "1 pollen/hour per IP+key",
    "DOCS_PAGE.publishableFeature3.text":
        "Beta: Use secret keys for production",
    "DOCS_PAGE.secretLabel.text": "Secret",
    "DOCS_PAGE.secretFeature1.text": "Server-side only",
    "DOCS_PAGE.secretFeature2.text": "Never expose publicly",
    "DOCS_PAGE.secretFeature3.text": "No rate limits",
    "DOCS_PAGE.getYourKeyLabel.text": "Get Your Key",
    "DOCS_PAGE.usageExamplesLabel.text": "Usage Examples",
    "DOCS_PAGE.serverSideDescription.text":
        "Server-side (Recommended): Use secret key in Authorization header",
    "DOCS_PAGE.clientSideDescription.text":
        "Client-side (Public): Use publishable key in query parameter",
    "HELLO_PAGE.heroTitle.text": "An AI platform for creative developers.",
    "HELLO_PAGE.heroIntro.text":
        "Soft, simple tools for people who want to build with heart — whether you're exploring ideas, crafting worlds, or shipping serious apps.",
    "HELLO_PAGE.heroTagline.text":
        "Open-source roots. Community at the center.",
    "HELLO_PAGE.whatIsTitle.text": "What Pollinations Is",
    "HELLO_PAGE.whatIsDescription.text":
        "Pollinations is a credit-based AI platform for developers who want to move quickly, stay playful, and still have something they can rely on in production. We offer a unified multimodal API for images, text, audio — with real-time and video on the way. Pollen, a simple credit system that makes usage predictable and transparent. A developer journey that feels welcoming instead of corporate. A community that's already building tools, games, and experiments with us every day.",
    "HELLO_PAGE.whatIsTagline.text":
        "Pollen exists so developers can experiment freely, without getting lost in pricing tables or infrastructure details.",
    "HELLO_PAGE.pollenTitle.text": "Pollen — One Simple Credit for Everything",
    "HELLO_PAGE.pollenDescription.text":
        "Pollen is the single credit you use across Pollinations for all generative media. One unit for many models, so you can switch, mix, and iterate without mental overhead.",
    "HELLO_PAGE.getPollenTitle.text": "How to Get Pollen",
    "HELLO_PAGE.getPollenIntro.text": "Two main paths:",
    "HELLO_PAGE.buyCardTitle.text": "Buy Pollen",
    "HELLO_PAGE.buyCardDescription.text":
        "Add Pollen to your wallet and build. Straightforward packs, no subscriptions, no locked-in tiers.",
    "HELLO_PAGE.earnCardTitle.text": "Earn Pollen",
    "HELLO_PAGE.earnCardDescription.text":
        "For developers growing inside the Pollinations ecosystem. Earn through daily sponsorship grants as you progress through tiers, or complete one-off quests and bounties.",
    "HELLO_PAGE.tiersSubtitle.text": "Sponsorship Tiers",
    "HELLO_PAGE.tiersDescription.text":
        "Grow your daily Pollen grant as you build and ship:",
    "HELLO_PAGE.tierSporeTitle.text": "Spore — You join.",
    "HELLO_PAGE.tierSporeDescription.text":
        "Small daily Pollen to try the platform.",
    "HELLO_PAGE.tierSeedTitle.text": "Seed — You verify as a developer.",
    "HELLO_PAGE.tierSeedDescription.text":
        "Higher daily Pollen. Based on light signals like GitHub, Discord, and a short intro.",
    "HELLO_PAGE.tierFlowerTitle.text": "Flower — You publish a working app.",
    "HELLO_PAGE.tierFlowerDescription.text":
        "Bigger daily Pollen grants. Your app is registered and reviewed in the dashboard.",
    "HELLO_PAGE.tierNectarTitle.text": "Nectar — Your app shows real traction.",
    "HELLO_PAGE.tierNectarDescription.text":
        "The highest grants. Tuned to apps that create value and activity in the ecosystem.",
    "HELLO_PAGE.questsSubtitle.text": "Quests & One-Off Rewards",
    "HELLO_PAGE.questsDescription.text":
        "Complete community quests, bounties, and contributions to earn extra Pollen. Fix issues, share knowledge, contribute to projects, or take part in creative challenges.",
    "HELLO_PAGE.questsStatus.text": "Coming soon",
    "HELLO_PAGE.buildTitle.text": "What You Can Build",
    "HELLO_PAGE.buildIntro.text": "Generative tools without friction:",
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
        "Simple Credits — Pollen makes usage and cost easier to reason about.",
    "HELLO_PAGE.whyChooseFeature4.text":
        "Community-First — roadmap influenced directly by people building with us.",
    "HELLO_PAGE.whyChooseFeature5.text":
        "Open Source — we build in the open and invite you to look under the hood.",
    "HELLO_PAGE.communityTitle.text": "Built With Community",
    "HELLO_PAGE.communityDescription.text":
        "Pollinations is shaped by students, indie devs, small teams, and studios experimenting with new forms of AI-native creativity. Active community channels, open discussions on features and models, bounties and quests coming soon.",
    "HELLO_PAGE.roadmapTitle.text": "Roadmap (Preview)",
    "HELLO_PAGE.roadmapIntro.text":
        "We're in beta, and we share where we're heading:",
    "HELLO_PAGE.roadmapItem1Title.text": "Secure Front-End Spending",
    "HELLO_PAGE.roadmapItem1Description.text":
        "Let client-side apps use Pollen safely.",
    "HELLO_PAGE.roadmapItem2Title.text": "In-App Pollen Purchases",
    "HELLO_PAGE.roadmapItem2Description.text":
        "Users buy Pollen inside your app; you earn a share. (Q1 2026)",
    "HELLO_PAGE.roadmapItem3Title.text": "App Hosting & Discovery",
    "HELLO_PAGE.roadmapItem3Description.text":
        "Ship your app and make it easy to find.",
    "HELLO_PAGE.roadmapItem4Title.text": "Expanded Modalities & Models",
    "HELLO_PAGE.roadmapItem4Description.text":
        "Real-time experiences, video generation, and a growing catalog—more choices, same simple Pollen system.",
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
    "SOCIAL_LINKS.discord.url": "https://discord.gg/pollinations-ai-885844321461485618",
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
export const GayPrideLgbtqBackgroundHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>The Living Web - Pride Flow</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            overflow: hidden;
            background-color: #000; /* Fallback */
        }
        #canvas-container {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 1;
        }
        #overlay {
            position: absolute;
            bottom: 20px;
            right: 20px;
            font-family: sans-serif;
            font-size: 12px;
            color: rgba(255, 255, 255, 0.4);
            z-index: 2;
            pointer-events: none;
            user-select: none;
        }
    </style>
</head>
<body>
    <div id="canvas-container"></div>
    <div id="overlay">pollinations.ai background</div>

    <script type="module">
        import * as THREE from 'https://esm.sh/three';

        // Configuration and Colors
        const COLORS = {
            sceneBackground: '{{BACKGROUND_BASE}}',
            filaments: '{{BACKGROUND_ELEMENT1}}',
            nodes: '{{BACKGROUND_ELEMENT2}}',
            particles: '{{BACKGROUND_PARTICLE}}'
        };

        // Scene Globals
        let scene, camera, renderer;
        let linesMesh, particlesMesh, nodesMesh;
        let time = 0;
        const container = document.getElementById('canvas-container');
        
        // Motion preferences
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        // Geometry Data holders for animation
        let linePositionsOriginal;
        
        initRenderer();
        initScene();
        createOrganicElements();
        animate();

        function initRenderer() {
            renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            renderer.setSize(window.innerWidth, window.innerHeight);
            container.appendChild(renderer.domElement);

            window.addEventListener('resize', onWindowResize, false);
        }

        function initScene() {
            scene = new THREE.Scene();
            scene.background = new THREE.Color(COLORS.sceneBackground);
            
            // Fog for depth fading
            scene.fog = new THREE.FogExp2(COLORS.sceneBackground, 0.002);

            camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
            
            // Camera position: slightly elevated, looking into the flow
            camera.position.set(0, 5, 50); 
            camera.lookAt(0, 0, 0);
        }

        function createOrganicElements() {
            // 1. THE FLOWING WEB (Filaments)
            // Represents the interconnected strands of community and life.
            // We use a custom BufferGeometry to create flowing, wavy lines.
            
            const numLines = 40;
            const segments = 100;
            const width = 100;
            const depth = 100;
            
            const geometry = new THREE.BufferGeometry();
            const positions = new Float32Array(numLines * segments * 3);
            const indices = [];

            // Generate initial grid of lines
            for (let i = 0; i < numLines; i++) {
                const xOffset = (i / numLines) * width - (width / 2);
                
                for (let j = 0; j < segments; j++) {
                    const z = (j / segments) * depth - (depth / 2);
                    const x = xOffset;
                    const y = 0; // Will be animated

                    const index = (i * segments + j) * 3;
                    positions[index] = x;
                    positions[index + 1] = y;
                    positions[index + 2] = z;

                    // Connect segments for lines
                    if (j < segments - 1) {
                        const base = i * segments + j;
                        indices.push(base, base + 1);
                    }
                }
            }

            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geometry.setIndex(indices);
            
            // Store original positions for sine wave calculation relative to origin
            linePositionsOriginal = positions.slice();

            const lineMaterial = new THREE.LineBasicMaterial({
                color: COLORS.filaments,
                transparent: true,
                opacity: 0.4,
                depthWrite: false,
                linewidth: 1 // Note: WebGL linewidth is often limited to 1
            });

            linesMesh = new THREE.LineSegments(geometry, lineMaterial);
            scene.add(linesMesh);

            // 2. NODES (Junctions)
            // Representing individuals or glowing connection points.
            // Floating slightly above the flow.
            const nodeGeo = new THREE.IcosahedronGeometry(0.3, 0);
            const nodeMat = new THREE.MeshBasicMaterial({
                color: COLORS.nodes,
                transparent: true,
                opacity: 0.8
            });
            
            const numNodes = 60;
            nodesMesh = new THREE.InstancedMesh(nodeGeo, nodeMat, numNodes);
            
            const dummy = new THREE.Object3D();
            for (let i = 0; i < numNodes; i++) {
                // Random scatter within the flow volume
                dummy.position.set(
                    (Math.random() - 0.5) * 80,
                    (Math.random() * 10) - 2,
                    (Math.random() - 0.5) * 80
                );
                // Random scales
                const s = 0.5 + Math.random() * 1.5;
                dummy.scale.set(s, s, s);
                dummy.updateMatrix();
                nodesMesh.setMatrixAt(i, dummy.matrix);
            }
            scene.add(nodesMesh);

            // 3. PARTICLES (Spores/Dust/Glitter)
            // Representing the "spirit" or atmosphere.
            const particleGeo = new THREE.TetrahedronGeometry(0.15, 0);
            const particleMat = new THREE.MeshBasicMaterial({
                color: COLORS.particles,
                transparent: true,
                opacity: 0.6
            });

            const numParticles = 300;
            particlesMesh = new THREE.InstancedMesh(particleGeo, particleMat, numParticles);
            
            for (let i = 0; i < numParticles; i++) {
                dummy.position.set(
                    (Math.random() - 0.5) * 120,
                    (Math.random() - 0.5) * 60 + 10, // Higher up
                    (Math.random() - 0.5) * 100 - 20
                );
                dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
                const s = Math.random() * 2.0;
                dummy.scale.set(s, s, s);
                dummy.updateMatrix();
                particlesMesh.setMatrixAt(i, dummy.matrix);
            }
            scene.add(particlesMesh);
        }

        function onWindowResize() {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }

        function animate() {
            requestAnimationFrame(animate);

            // Handle reduced motion
            if (prefersReducedMotion) {
                renderer.render(scene, camera);
                return;
            }

            const now = performance.now();
            time = now * 0.001;

            // Animate Camera drift (Subtle parallax)
            // Creates a sense of moving forward through the web slowly
            camera.position.z = 50 + Math.sin(time * 0.1) * 5;
            camera.position.x = Math.cos(time * 0.05) * 2;
            camera.lookAt(0, 0, 0);

            // Animate Lines (Wave effect)
            if (linesMesh) {
                const positions = linesMesh.geometry.attributes.position.array;
                const numPoints = positions.length / 3;

                for (let i = 0; i < numPoints; i++) {
                    const ix = i * 3;
                    const iy = ix + 1;
                    const iz = ix + 2;

                    const origX = linePositionsOriginal[ix];
                    const origZ = linePositionsOriginal[iz];

                    // Create a flowing wave pattern
                    // A mix of sine waves traveling along Z (depth) and X (width)
                    const wave1 = Math.sin(origZ * 0.1 + time * 1.5);
                    const wave2 = Math.cos(origX * 0.05 + time * 2.0);
                    const wave3 = Math.sin((origX + origZ) * 0.05 + time * 0.5);

                    // Apply height changes
                    positions[iy] = (wave1 * 2) + (wave2 * 2) + wave3;
                }
                linesMesh.geometry.attributes.position.needsUpdate = true;
            }

            // Animate Nodes (Gentle Bobbing)
            if (nodesMesh) {
                nodesMesh.rotation.y = time * 0.05;
                nodesMesh.position.y = Math.sin(time * 0.5) * 1.0;
            }

            // Animate Particles (Drifting Upwards)
            if (particlesMesh) {
                particlesMesh.rotation.y = time * -0.05;
                particlesMesh.rotation.x = Math.sin(time * 0.1) * 0.1;
                
                // Simulate "breathing" scale on particles slightly
                const scaleFactor = 1 + Math.sin(time * 2) * 0.05;
                particlesMesh.scale.setScalar(scaleFactor);
            }

            renderer.render(scene, camera);
        }
    </script>
</body>
</html>`;
