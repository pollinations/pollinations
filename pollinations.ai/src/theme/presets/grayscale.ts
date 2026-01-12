import { type LLMThemeResponse, processTheme } from "../style/theme-processor";

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
