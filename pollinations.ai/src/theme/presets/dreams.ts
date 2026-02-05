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
