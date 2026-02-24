import { type LLMThemeResponse, processTheme } from "../style/theme-processor";

export const PixelartTheme: LLMThemeResponse = {
    "slots": {
        "slot_0": {
            "hex": "#110518",
            "ids": [
                "text.primary",
                "text.accent",
                "input.border",
                "input.text",
                "button.primary.border",
                "button.secondary.border",
                "button.focus.ring",
                "border.accent",
                "border.main",
                "border.strong",
                "shadow.dark.md",
                "shadow.dark.lg",
                "logo.main",
            ],
        },
        "slot_1": {
            "hex": "#4A3B52",
            "ids": ["text.secondary", "shadow.dark.sm"],
        },
        "slot_2": {
            "hex": "#E0BBE4",
            "ids": [
                "button.secondary.bg",
                "indicator.image",
                "background.element2",
            ],
        },
        "slot_3": {
            "hex": "#EAEAEA",
            "ids": ["button.disabled.bg"],
        },
        "slot_4": {
            "hex": "#FFDFD3",
            "ids": [
                "indicator.audio",
                "shadow.highlight.md",
                "background.particle",
            ],
        },
        "slot_5": {
            "hex": "#B4F8C8",
            "ids": ["indicator.video", "shadow.highlight.sm"],
        },
        "slot_6": {
            "hex": "#D4C5D9",
            "ids": ["border.subtle"],
        },
        "slot_7": {
            "hex": "#F0E6F2",
            "ids": ["border.faint"],
        },
        "slot_8": {
            "hex": "#000000",
            "ids": ["shadow.dark.xl"],
        },
        "slot_9": {
            "hex": "#7D6D85",
            "ids": ["text.tertiary"],
        },
        "slot_10": {
            "hex": "#9E8FA5",
            "ids": ["text.caption"],
        },
        "slot_11": {
            "hex": "#FFFDF5",
            "ids": ["text.inverse", "surface.page", "background.base"],
        },
        "slot_12": {
            "hex": "#ecf874",
            "ids": [
                "indicator.text",
                "border.brand",
                "border.highlight",
                "shadow.brand.sm",
                "shadow.brand.md",
                "shadow.brand.lg",
                "logo.accent",
                "background.element1",
            ],
        },
        "slot_13": {
            "hex": "#2E8B57",
            "ids": ["text.highlight", "button.primary.bg", "text.brand"],
        },
        "slot_14": {
            "hex": "#FFFFFF",
            "ids": ["surface.card", "input.bg"],
        },
        "slot_15": {
            "hex": "#F4F1DE",
            "ids": ["surface.base"],
        },
        "slot_16": {
            "hex": "#A99FB0",
            "ids": ["input.placeholder"],
        },
    },
    "borderRadius": {
        "radius.button": "0px",
        "radius.input": "0px",
        "radius.subcard": "0px",
        "radius.card": "4px",
        "radius.tag": "0px",
    },
    "fonts": {
        "font.title": "Press Start 2P",
        "font.headline": "VT323",
        "font.body": "Space Mono",
    },
    "opacity": {
        "opacity.card": "1",
        "opacity.overlay": "0.95",
        "opacity.glass": "0.9",
    },
};

export const PixelartCssVariables = processTheme(PixelartTheme).cssVariables;

// Background HTML (raw template literal)
export const PixelartBackgroundHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>The Living Web</title>
    <style>
        body, html {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
            background-color: {{BACKGROUND_BASE}};
            font-family: sans-serif;
        }
        #canvas-container {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 1;
        }
    </style>
</head>
<body>
    <div id="canvas-container"></div>

    <script type="module">
        import * as THREE from 'https://esm.sh/three@0.160.0';

        // --- Configuration & State ---
        const CONFIG = {
            nodeCount: 150,
            connectionDistance: 18, // threshold to connect nodes
            maxConnections: 4,     // limit per node for style
            particleCount: 200,
            baseSpeed: 0.5,
            range: 80,             // spread of the network
            colors: {
                background: '{{BACKGROUND_BASE}}',
                filaments: '{{BACKGROUND_ELEMENT1}}',
                nodes: '{{BACKGROUND_ELEMENT2}}',
                particles: '{{BACKGROUND_PARTICLE}}'
            }
        };

        const state = {
            width: window.innerWidth,
            height: window.innerHeight,
            mouseX: 0,
            mouseY: 0,
            targetRotationX: 0,
            targetRotationY: 0,
            reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        };

        // --- Scene Setup ---
        const container = document.getElementById('canvas-container');
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(CONFIG.colors.background);

        // Fog for depth fading
        scene.fog = new THREE.FogExp2(CONFIG.colors.background, 0.015);

        const camera = new THREE.PerspectiveCamera(75, state.width / state.height, 0.1, 1000);
        camera.position.z = 60;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setSize(state.width, state.height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        container.appendChild(renderer.domElement);

        // --- Geometry Creation: The Web ---
        // We will share the position attribute between points (nodes) and lines (filaments)
        // so we only update one buffer and both visuals update.

        const nodePositions = new Float32Array(CONFIG.nodeCount * 3);
        const nodeOrigins = new Float32Array(CONFIG.nodeCount * 3);
        const nodeData = []; // Store metadata like phase, speed

        // 1. Generate Nodes
        for (let i = 0; i < CONFIG.nodeCount; i++) {
            const i3 = i * 3;
            // Random distribution in a sphere-like cloud
            const r = CONFIG.range * Math.cbrt(Math.random());
            const theta = Math.random() * 2 * Math.PI;
            const phi = Math.acos(2 * Math.random() - 1);

            const x = r * Math.sin(phi) * Math.cos(theta);
            const y = r * Math.sin(phi) * Math.sin(theta);
            const z = r * Math.cos(phi);

            nodeOrigins[i3] = x;
            nodeOrigins[i3 + 1] = y;
            nodeOrigins[i3 + 2] = z;

            nodePositions[i3] = x;
            nodePositions[i3 + 1] = y;
            nodePositions[i3 + 2] = z;

            nodeData.push({
                speed: 0.2 + Math.random() * 0.8,
                phase: Math.random() * Math.PI * 2,
                amplitude: 1 + Math.random() * 2,
                freq: 0.5 + Math.random() * 0.5
            });
        }

        const sharedGeometry = new THREE.BufferGeometry();
        sharedGeometry.setAttribute('position', new THREE.BufferAttribute(nodePositions, 3));

        // 2. Generate Connections (Indices for Lines)
        const lineIndices = [];
        const posAttr = sharedGeometry.attributes.position;
        const tempVecA = new THREE.Vector3();
        const tempVecB = new THREE.Vector3();

        for (let i = 0; i < CONFIG.nodeCount; i++) {
            tempVecA.fromBufferAttribute(posAttr, i);
            let connections = 0;

            // Find closest neighbors to connect to
            // This is O(N^2) but N is small (150), so it's fine for init
            const neighbors = [];
            for (let j = i + 1; j < CONFIG.nodeCount; j++) {
                tempVecB.fromBufferAttribute(posAttr, j);
                const dist = tempVecA.distanceTo(tempVecB);
                if (dist < CONFIG.connectionDistance) {
                    neighbors.push({ index: j, dist: dist });
                }
            }

            // Sort by distance and limit connections
            neighbors.sort((a, b) => a.dist - b.dist);
            for (let k = 0; k < Math.min(neighbors.length, CONFIG.maxConnections); k++) {
                lineIndices.push(i, neighbors[k].index);
            }
        }

        // Geometry for Lines needs the indices
        const linesGeometry = new THREE.BufferGeometry();
        linesGeometry.setAttribute('position', sharedGeometry.getAttribute('position')); // Share buffer
        linesGeometry.setIndex(lineIndices);

        // --- Materials ---
        const nodesMaterial = new THREE.PointsMaterial({
            color: CONFIG.colors.nodes,
            size: 1.5,
            transparent: true,
            opacity: 0.8,
            sizeAttenuation: true,
            depthWrite: false
        });

        const linesMaterial = new THREE.LineBasicMaterial({
            color: CONFIG.colors.filaments,
            transparent: true,
            opacity: 0.25,
            depthWrite: false,
            linewidth: 1 // Note: OpenGL linewidth is usually 1 on most browsers
        });

        // --- Meshes ---
        const nodeSystem = new THREE.Points(sharedGeometry, nodesMaterial);
        const lineSystem = new THREE.LineSegments(linesGeometry, linesMaterial);

        // Group them to rotate together
        const webGroup = new THREE.Group();
        webGroup.add(nodeSystem);
        webGroup.add(lineSystem);
        scene.add(webGroup);

        // --- Background Particles (Floating Spores) ---
        const particleGeo = new THREE.BufferGeometry();
        const pPos = [];
        for (let i = 0; i < CONFIG.particleCount; i++) {
            pPos.push(
                (Math.random() - 0.5) * 200,
                (Math.random() - 0.5) * 200,
                (Math.random() - 0.5) * 200
            );
        }
        particleGeo.setAttribute('position', new THREE.Float32BufferAttribute(pPos, 3));
        const particleMat = new THREE.PointsMaterial({
            color: CONFIG.colors.particles,
            size: 0.8,
            transparent: true,
            opacity: 0.4,
            depthWrite: false
        });
        const particles = new THREE.Points(particleGeo, particleMat);
        scene.add(particles);

        // --- Animation Logic ---

        // Mouse Interaction
        window.addEventListener('mousemove', (e) => {
            // Normalized coordinates -1 to 1
            state.mouseX = (e.clientX / state.width) * 2 - 1;
            state.mouseY = -(e.clientY / state.height) * 2 + 1;
        });

        // Resize Handling
        window.addEventListener('resize', () => {
            state.width = window.innerWidth;
            state.height = window.innerHeight;
            camera.aspect = state.width / state.height;
            camera.updateProjectionMatrix();
            renderer.setSize(state.width, state.height);
        });

        const clock = new THREE.Clock();

        function animate() {
            requestAnimationFrame(animate);

            const time = clock.getElapsedTime();
            const delta = clock.getDelta();

            // 1. Animate Web Nodes (Breathing)
            const positions = sharedGeometry.attributes.position.array;

            // If reduced motion, we minimize movement
            const motionScale = state.reducedMotion ? 0.1 : 1.0;

            for (let i = 0; i < CONFIG.nodeCount; i++) {
                const i3 = i * 3;
                const data = nodeData[i];

                // Gentle sine wave oscillation around origin
                // Using different frequencies for x, y, z to feel organic
                const ox = nodeOrigins[i3];
                const oy = nodeOrigins[i3 + 1];
                const oz = nodeOrigins[i3 + 2];

                positions[i3]     = ox + Math.sin(time * data.speed + data.phase) * data.amplitude * motionScale;
                positions[i3 + 1] = oy + Math.cos(time * data.speed * 0.9 + data.phase) * data.amplitude * motionScale;
                positions[i3 + 2] = oz + Math.sin(time * data.speed * 0.7 + data.phase + 2) * data.amplitude * motionScale;
            }

            // Mark geometry as needing update
            sharedGeometry.attributes.position.needsUpdate = true;

            // 2. Gentle Camera/Group Rotation (Parallax)
            // Target rotation based on mouse
            const targetX = state.mouseY * 0.1; // mild tilt
            const targetY = state.mouseX * 0.1;

            // Smoothly interpolate current rotation to target
            webGroup.rotation.x += (targetX - webGroup.rotation.x) * 0.05;
            webGroup.rotation.y += (targetY - webGroup.rotation.y) * 0.05;

            // Constant slow drift rotation
            if (!state.reducedMotion) {
                webGroup.rotation.z = Math.sin(time * 0.05) * 0.05;
                particles.rotation.y = time * 0.02;
            }

            renderer.render(scene, camera);
        }

        // Start
        animate();
    </script>
</body>
</html>`;
