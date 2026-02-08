import { type LLMThemeResponse, processTheme } from "../style/theme-processor";

export const AVastDeepOceanSceneFilledWithDriftingBioluminescentLifeSoftDarknessWithVolumetricBlueHazeDiverseGlowingOrganismsOfDifferentColorsTurquoiseVioletAmberSoftPinkSizesTinySpecksToLargeFloatingFormsAndShapesJellTheme: LLMThemeResponse =
    {
        "slots": {
            "slot_0": {
                "hex": "#ecf9fa",
                "ids": ["text.primary"],
            },
            "slot_1": {
                "hex": "#9dbec9",
                "ids": ["text.secondary"],
            },
            "slot_2": {
                "hex": "#456880",
                "ids": ["input.placeholder"],
            },
            "slot_3": {
                "hex": "#ffffff",
                "ids": ["input.text", "logo.main"],
            },
            "slot_4": {
                "hex": "#1c0e33",
                "ids": ["button.secondary.bg"],
            },
            "slot_5": {
                "hex": "#8e4dff",
                "ids": [
                    "button.secondary.border",
                    "indicator.image",
                    "background.element2",
                ],
            },
            "slot_6": {
                "hex": "#0e2433",
                "ids": ["button.disabled.bg"],
            },
            "slot_7": {
                "hex": "#ffb74d",
                "ids": ["indicator.text", "background.particle"],
            },
            "slot_8": {
                "hex": "#ff4081",
                "ids": ["indicator.audio", "logo.accent"],
            },
            "slot_21": {
                "hex": "#00e676",
                "ids": ["indicator.video"],
            },
            "slot_9": {
                "hex": "#1e3d52",
                "ids": ["border.main"],
            },
            "slot_10": {
                "hex": "#5d7d8a",
                "ids": ["text.tertiary"],
            },
            "slot_11": {
                "hex": "#2d5773",
                "ids": ["border.strong"],
            },
            "slot_12": {
                "hex": "#0f283d",
                "ids": ["border.subtle"],
            },
            "slot_13": {
                "hex": "#0a1b29",
                "ids": ["border.faint"],
            },
            "slot_14": {
                "hex": "#43616e",
                "ids": ["text.caption"],
            },
            "slot_15": {
                "hex": "#01080f",
                "ids": ["text.inverse", "surface.page", "background.base"],
            },
            "slot_16": {
                "hex": "#00f2ea",
                "ids": [
                    "text.brand",
                    "text.highlight",
                    "button.primary.bg",
                    "button.primary.border",
                    "button.focus.ring",
                    "border.brand",
                    "border.highlight",
                    "background.element1",
                ],
            },
            "slot_17": {
                "hex": "#05131f",
                "ids": ["surface.card"],
            },
            "slot_18": {
                "hex": "#030e18",
                "ids": ["surface.base"],
            },
            "slot_19": {
                "hex": "#0a2033",
                "ids": ["input.bg"],
            },
            "slot_20": {
                "hex": "#1a3f5c",
                "ids": ["input.border"],
            },
        },
        "borderRadius": {
            "radius.button": "24px",
            "radius.card": "20px",
            "radius.input": "12px",
            "radius.subcard": "12px",
        },
        "fonts": {
            "font.title": "Rajdhani",
            "font.headline": "Space Grotesk",
            "font.body": "Outfit",
        },
        "opacity": {
            "opacity.card": "0.65",
            "opacity.overlay": "0.85",
            "opacity.glass": "0.6",
        },
    };

export const AVastDeepOceanSceneFilledWithDriftingBioluminescentLifeSoftDarknessWithVolumetricBlueHazeDiverseGlowingOrganismsOfDifferentColorsTurquoiseVioletAmberSoftPinkSizesTinySpecksToLargeFloatingFormsAndShapesJellCssVariables =
    processTheme(
        AVastDeepOceanSceneFilledWithDriftingBioluminescentLifeSoftDarknessWithVolumetricBlueHazeDiverseGlowingOrganismsOfDifferentColorsTurquoiseVioletAmberSoftPinkSizesTinySpecksToLargeFloatingFormsAndShapesJellTheme,
    ).cssVariables;

// Background HTML (raw template literal)
export const AVastDeepOceanSceneFilledWithDriftingBioluminescentLifeSoftDarknessWithVolumetricBlueHazeDiverseGlowingOrganismsOfDifferentColorsTurquoiseVioletAmberSoftPinkSizesTinySpecksToLargeFloatingFormsAndShapesJellBackgroundHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>The Living Web: Deep Ocean</title>
    <style>
        body, html {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
            background-color: {{BACKGROUND_BASE}};
        }
        canvas {
            display: block;
            width: 100%;
            height: 100%;
        }
        #overlay {
            position: absolute;
            bottom: 20px;
            right: 20px;
            font-family: sans-serif;
            font-size: 10px;
            color: {{BACKGROUND_PARTICLE}};
            opacity: 0.5;
            pointer-events: none;
            user-select: none;
            letter-spacing: 1px;
        }
    </style>
</head>
<body>
    <div id="overlay">pollinations.ai background</div>
    <script type="module">
        import * as THREE from 'https://esm.sh/three';

        // --- CONFIGURATION & COLORS ---
        const COLORS = {
            background: '{{BACKGROUND_BASE}}',
            primary: '{{BACKGROUND_ELEMENT1}}', // Main organism bodies/filaments
            secondary: '{{BACKGROUND_ELEMENT2}}', // Cores/Nodes
            particles: '{{BACKGROUND_PARTICLE}}' // Dust/Spores
        };

        // --- STATE ---
        let scene, camera, renderer;
        let time = 0;
        let width, height;
        let organisms = [];
        let particles;
        let mouseX = 0, mouseY = 0;
        
        // Reduced motion preference
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        // --- INITIALIZATION ---
        function init() {
            const container = document.body;
            width = window.innerWidth;
            height = window.innerHeight;

            // Scene setup
            scene = new THREE.Scene();
            scene.background = new THREE.Color(COLORS.background);
            // Volumetric haze effect
            scene.fog = new THREE.FogExp2(COLORS.background, 0.035);

            // Camera
            camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100);
            camera.position.z = 20;

            // Renderer
            renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
            renderer.setSize(width, height);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Performance clamp
            container.appendChild(renderer.domElement);

            // Create Elements
            createParticles();
            createOrganisms();

            // Event Listeners
            window.addEventListener('resize', onWindowResize, false);
            document.addEventListener('mousemove', onMouseMove, false);

            // Start Loop
            requestAnimationFrame(animate);
        }

        // --- GEOMETRY & OBJECTS ---

        // 1. Background Marine Snow / Particles
        function createParticles() {
            const particleCount = 400;
            const geometry = new THREE.BufferGeometry();
            const positions = new Float32Array(particleCount * 3);
            const randoms = new Float32Array(particleCount); // For offset animation

            for (let i = 0; i < particleCount; i++) {
                positions[i * 3] = (Math.random() - 0.5) * 60; // x
                positions[i * 3 + 1] = (Math.random() - 0.5) * 60; // y
                positions[i * 3 + 2] = (Math.random() - 0.5) * 40; // z
                randoms[i] = Math.random();
            }

            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1));

            const material = new THREE.PointsMaterial({
                color: COLORS.particles,
                size: 0.15,
                transparent: true,
                opacity: 0.6,
                depthWrite: false,
                sizeAttenuation: true
            });

            particles = new THREE.Points(geometry, material);
            scene.add(particles);
        }

        // 2. Floating Organisms (Jelly-like nodes)
        function createOrganisms() {
            const organismCount = 18;
            
            // Shared Geometry for performance
            // The "Bell" (Primary)
            const bellGeometry = new THREE.IcosahedronGeometry(1, 1);
            // The "Core" (Secondary)
            const coreGeometry = new THREE.SphereGeometry(0.4, 8, 8);
            // The "Tentacles" (Lines)
            const tentacleGeometry = new THREE.BufferGeometry();
            const tentaclePoints = [];
            const tentacleSegments = 6;
            for(let i=0; i<tentacleSegments; i++) {
                tentaclePoints.push(new THREE.Vector3(0, -i * 0.5, 0));
            }
            tentacleGeometry.setFromPoints(tentaclePoints);

            // Materials
            const bellMaterial = new THREE.MeshBasicMaterial({
                color: COLORS.primary,
                transparent: true,
                opacity: 0.15,
                depthWrite: false,
                wireframe: true
            });

            const coreMaterial = new THREE.MeshBasicMaterial({
                color: COLORS.secondary,
                transparent: true,
                opacity: 0.6,
                depthWrite: false
            });

            const tentacleMaterial = new THREE.LineBasicMaterial({
                color: COLORS.primary,
                transparent: true,
                opacity: 0.3,
                depthWrite: false
            });

            for (let i = 0; i < organismCount; i++) {
                const group = new THREE.Group();
                
                // Random Position
                const x = (Math.random() - 0.5) * 35;
                const y = (Math.random() - 0.5) * 25;
                const z = (Math.random() - 0.5) * 15;
                group.position.set(x, y, z);

                // Store origin for floating animation
                group.userData = {
                    origin: new THREE.Vector3(x, y, z),
                    phase: Math.random() * Math.PI * 2,
                    speed: 0.0005 + Math.random() * 0.001,
                    scaleBase: 0.5 + Math.random() * 0.8
                };

                // Add Body Parts
                const bell = new THREE.Mesh(bellGeometry, bellMaterial);
                const core = new THREE.Mesh(coreGeometry, coreMaterial);
                
                // Add a few tentacles
                for(let t=0; t<3; t++) {
                    const tentacle = new THREE.Line(tentacleGeometry, tentacleMaterial);
                    tentacle.position.x = (Math.random() - 0.5) * 0.5;
                    tentacle.position.z = (Math.random() - 0.5) * 0.5;
                    tentacle.rotation.y = Math.random() * Math.PI;
                    tentacle.scale.setScalar(0.5 + Math.random() * 0.5);
                    group.add(tentacle);
                }

                group.add(bell);
                group.add(core);
                
                scene.add(group);
                organisms.push(group);
            }
        }

        // --- ANIMATION ---
        function animate() {
            requestAnimationFrame(animate);

            // Safety check for time
            let now = performance.now();
            if (!time) time = now;
            const delta = now - time;
            time = now;

            // If reduced motion, render once or very slowly
            const speedFactor = prefersReducedMotion ? 0.1 : 1.0;
            const slowTime = now * 0.001 * speedFactor;

            // 1. Animate Particles (Drift Upwards/Flow)
            if (particles) {
                const positions = particles.geometry.attributes.position.array;
                for (let i = 0; i < positions.length; i += 3) {
                    // Upward drift
                    positions[i + 1] += 0.01 * speedFactor; 
                    
                    // Reset if out of view
                    if (positions[i + 1] > 30) {
                        positions[i + 1] = -30;
                    }
                }
                particles.geometry.attributes.position.needsUpdate = true;
                // Subtle rotation of the whole field
                particles.rotation.y = Math.sin(slowTime * 0.1) * 0.1;
            }

            // 2. Animate Organisms
            organisms.forEach((group) => {
                const data = group.userData;

                // Bobbing motion (vertical)
                const floatY = Math.sin(slowTime + data.phase) * 1.5;
                group.position.y = data.origin.y + floatY;

                // Gentle drift (horizontal)
                const driftX = Math.cos(slowTime * 0.5 + data.phase) * 0.5;
                group.position.x = data.origin.x + driftX;

                // Pulsing scale (breathing)
                const breath = 1 + Math.sin(slowTime * 2 + data.phase) * 0.1;
                group.scale.setScalar(data.scaleBase * breath);

                // Slow rotation
                group.rotation.z = Math.sin(slowTime * 0.2 + data.phase) * 0.1;
                group.rotation.y += 0.002 * speedFactor;
            });

            // 3. Camera Parallax (Subtle)
            if (!prefersReducedMotion) {
                camera.position.x += (mouseX * 0.5 - camera.position.x) * 0.05;
                camera.position.y += (-mouseY * 0.5 - camera.position.y) * 0.05;
                camera.lookAt(scene.position);
            }

            renderer.render(scene, camera);
        }

        // --- HANDLERS ---
        function onWindowResize() {
            width = window.innerWidth;
            height = window.innerHeight;
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            renderer.setSize(width, height);
        }

        function onMouseMove(event) {
            // Normalize mouse position from -1 to 1
            mouseX = (event.clientX / width) * 2 - 1;
            mouseY = (event.clientY / height) * 2 - 1;
        }

        // Start
        init();
    </script>
</body>
</html>`;
