import { type LLMThemeResponse, processTheme } from "../style/theme-processor";

export const PlantsAndTreesTheme: LLMThemeResponse = {
    "slots": {
        "slot_0": {
            "hex": "#e8f5e9",
            "ids": ["text.primary", "input.text"],
        },
        "slot_1": {
            "hex": "#e09e52",
            "ids": ["text.secondary", "indicator.text"],
        },
        "slot_2": {
            "hex": "#892f6c",
            "ids": ["indicator.video"],
        },
        "slot_3": {
            "hex": "#388e3c",
            "ids": ["border.strong"],
        },
        "slot_4": {
            "hex": "#607d8b",
            "ids": ["text.tertiary"],
        },
        "slot_5": {
            "hex": "#003300",
            "ids": ["shadow.brand.lg"],
        },
        "slot_6": {
            "hex": "#000000",
            "ids": ["shadow.dark.sm", "shadow.dark.lg", "shadow.dark.xl"],
        },
        "slot_7": {
            "hex": "#050a08",
            "ids": ["shadow.dark.md"],
        },
        "slot_8": {
            "hex": "#33691e",
            "ids": ["shadow.highlight.sm", "shadow.highlight.md"],
        },
        "slot_9": {
            "hex": "#81c784",
            "ids": ["logo.main"],
        },
        "slot_10": {
            "hex": "#cddc39",
            "ids": ["logo.accent", "background.particle"],
        },
        "slot_11": {
            "hex": "#795548",
            "ids": ["background.element2"],
        },
        "slot_12": {
            "hex": "#1b3026",
            "ids": ["input.bg", "button.secondary.bg", "border.subtle"],
        },
        "slot_13": {
            "hex": "#546e7a",
            "ids": ["text.caption"],
        },
        "slot_14": {
            "hex": "#1b5e20",
            "ids": ["text.inverse", "shadow.brand.sm", "shadow.brand.md"],
        },
        "slot_15": {
            "hex": "#acae4c",
            "ids": ["text.brand", "button.hover.overlay", "border.brand"],
        },
        "slot_16": {
            "hex": "#b9f6ca",
            "ids": ["text.highlight"],
        },
        "slot_17": {
            "hex": "#0a1410",
            "ids": ["surface.page", "background.base"],
        },
        "slot_18": {
            "hex": "#13261e",
            "ids": ["surface.card", "border.faint"],
        },
        "slot_19": {
            "hex": "#0f1f1a",
            "ids": ["surface.base"],
        },
        "slot_20": {
            "hex": "#2e4d3e",
            "ids": ["input.border", "button.secondary.border", "border.main"],
        },
        "slot_21": {
            "hex": "#4c6b5d",
            "ids": ["input.placeholder"],
        },
        "slot_22": {
            "hex": "#eee0af",
            "ids": ["button.active.overlay", "button.primary.bg"],
        },
        "slot_23": {
            "hex": "#43a047",
            "ids": ["button.primary.border", "background.element1"],
        },
        "slot_24": {
            "hex": "#1b2621",
            "ids": ["button.disabled.bg"],
        },
        "slot_25": {
            "hex": "#66bb6a",
            "ids": ["button.focus.ring", "indicator.image", "border.highlight"],
        },
        "slot_26": {
            "hex": "#4394df",
            "ids": ["indicator.audio"],
        },
    },
    "borderRadius": {
        "radius.button": "8px",
        "radius.card": "16px",
        "radius.input": "6px",
        "radius.subcard": "8px",
    },
    "fonts": {
        "font.title": "Bitter",
        "font.headline": "DM Sans",
        "font.body": "Nunito Sans",
    },
    "opacity": {
        "opacity.card": "0.92",
        "opacity.overlay": "0.88",
        "opacity.glass": "0.7",
    },
};

export const PlantsAndTreesCssVariables =
    processTheme(PlantsAndTreesTheme).cssVariables;

// Background HTML (raw template literal)
export const PlantsAndTreesBackgroundHtml = `<!DOCTYPE html>
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
            font-family: 'Courier New', Courier, monospace;
        }
        canvas {
            display: block;
            position: absolute;
            top: 0;
            left: 0;
            z-index: 0;
        }
        #label {
            position: absolute;
            bottom: 20px;
            right: 20px;
            color: {{BACKGROUND_ELEMENT1}};
            opacity: 0.5;
            font-size: 10px;
            z-index: 1;
            pointer-events: none;
            letter-spacing: 1px;
        }
    </style>
</head>
<body>
    <div id="label">pollinations.ai background</div>
    <script type="module">
        import * as THREE from 'https://esm.sh/three';

        // --- Configuration & Tokens ---
        const COLORS = {
            base: '{{BACKGROUND_BASE}}',
            wood: '{{BACKGROUND_ELEMENT1}}',
            leaf: '{{BACKGROUND_ELEMENT2}}',
            spore: '{{BACKGROUND_PARTICLE}}'
        };

        const SETTINGS = {
            treeCount: 15,
            particles: 200,
            animationSpeed: 0.0005,
            swayIntensity: 0.05
        };

        // Accessibility: Reduced Motion
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (prefersReducedMotion) {
            SETTINGS.animationSpeed = 0;
            SETTINGS.swayIntensity = 0;
        }

        // --- Global Variables ---
        let scene, camera, renderer;
        let forestGroup, particleSystem;
        let time = 0;
        
        // --- Initialization ---
        function init() {
            initScene();
            initRenderer();
            createForest();
            createParticles();
            handleResize();
            animate();
        }

        function initScene() {
            scene = new THREE.Scene();
            scene.background = new THREE.Color(COLORS.base);
            
            // Fog to blend distant trees into the background
            const bgCol = new THREE.Color(COLORS.base);
            scene.fog = new THREE.FogExp2(bgCol, 0.035);

            camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
            // Position camera inside the "forest" looking slightly up
            camera.position.set(0, 5, 15);
            camera.lookAt(0, 8, 0);
        }

        function initRenderer() {
            renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Performance cap
            document.body.appendChild(renderer.domElement);
            
            window.addEventListener('resize', handleResize);
        }

        // --- Asset Generation (Texture for Particles/Nodes) ---
        function createSoftCircleTexture() {
            const canvas = document.createElement('canvas');
            canvas.width = 32;
            canvas.height = 32;
            const ctx = canvas.getContext('2d');
            
            const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
            grad.addColorStop(0, 'rgba(255,255,255,1)');
            grad.addColorStop(1, 'rgba(255,255,255,0)');
            
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, 32, 32);
            
            const texture = new THREE.CanvasTexture(canvas);
            texture.magFilter = THREE.LinearFilter;
            texture.minFilter = THREE.LinearFilter;
            return texture;
        }

        // --- Content Generation: The Fractal Forest ---
        function createForest() {
            forestGroup = new THREE.Group();
            
            // We will build a single geometry for all branches (lines) and one for all nodes (leaves)
            // to minimize draw calls.
            const branchPositions = [];
            const leafPositions = [];
            
            // Helper recursive function to grow a tree
            const growBranch = (startPos, direction, length, depth) => {
                if (depth === 0) {
                    leafPositions.push(startPos.x, startPos.y, startPos.z);
                    return;
                }

                // Calculate end point of this segment
                const endPos = startPos.clone().add(direction.clone().multiplyScalar(length));
                
                // Add line segment
                branchPositions.push(startPos.x, startPos.y, startPos.z);
                branchPositions.push(endPos.x, endPos.y, endPos.z);

                // Add a node at the joint sometimes
                if (Math.random() > 0.6) {
                    leafPositions.push(endPos.x, endPos.y, endPos.z);
                }

                // Branch out
                const numBranches = Math.floor(Math.random() * 2) + 2; // 2 or 3 branches
                for (let i = 0; i < numBranches; i++) {
                    // Randomize direction slightly
                    const angleX = (Math.random() - 0.5) * 1.5;
                    const angleZ = (Math.random() - 0.5) * 1.5;
                    const angleY = (Math.random() * 0.5) + 0.5; // Always mostly up

                    const newDir = new THREE.Vector3(angleX, angleY, angleZ).normalize();
                    // Smooth the transition from previous direction
                    newDir.add(direction).normalize();

                    growBranch(endPos, newDir, length * 0.75, depth - 1);
                }
            };

            // Generate trees scattered on the XZ plane
            for (let i = 0; i < SETTINGS.treeCount; i++) {
                const rootX = (Math.random() - 0.5) * 40;
                const rootZ = (Math.random() - 0.5) * 20 - 5; // Push back slightly
                const rootPos = new THREE.Vector3(rootX, -5, rootZ); // Start below view
                const upDir = new THREE.Vector3(0, 1, 0);
                
                growBranch(rootPos, upDir, 3.5, 5); // 5 levels deep
            }

            // Create Branch Mesh
            const branchGeo = new THREE.BufferGeometry();
            branchGeo.setAttribute('position', new THREE.Float32BufferAttribute(branchPositions, 3));
            
            const branchMat = new THREE.LineBasicMaterial({
                color: COLORS.wood,
                transparent: true,
                opacity: 0.4,
                depthWrite: false,
                linewidth: 1 // Note: WebGL line width is often locked to 1px
            });
            const branches = new THREE.LineSegments(branchGeo, branchMat);
            forestGroup.add(branches);

            // Create Leaf/Node Mesh
            const leafGeo = new THREE.BufferGeometry();
            leafGeo.setAttribute('position', new THREE.Float32BufferAttribute(leafPositions, 3));
            
            const leafMat = new THREE.PointsMaterial({
                color: COLORS.leaf,
                size: 0.3,
                map: createSoftCircleTexture(),
                transparent: true,
                opacity: 0.7,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            });
            const leaves = new THREE.Points(leafGeo, leafMat);
            forestGroup.add(leaves);

            scene.add(forestGroup);
        }

        function createParticles() {
            const geo = new THREE.BufferGeometry();
            const pos = [];
            const sizes = [];
            
            for(let i=0; i<SETTINGS.particles; i++) {
                // Wide distribution
                pos.push((Math.random() - 0.5) * 50);
                pos.push((Math.random() * 20) - 5);
                pos.push((Math.random() - 0.5) * 30);
                
                sizes.push(Math.random() * 0.2 + 0.05);
            }
            
            geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
            geo.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));
            
            const mat = new THREE.PointsMaterial({
                color: COLORS.spore,
                transparent: true,
                opacity: 0.6,
                depthWrite: false,
                map: createSoftCircleTexture(),
                blending: THREE.AdditiveBlending
            });
            
            // Adjust size attenuation in shader manually or just let Three handle perspective
            mat.sizeAttenuation = true; 
            
            particleSystem = new THREE.Points(geo, mat);
            scene.add(particleSystem);
        }

        // --- Animation Loop ---
        function animate() {
            requestAnimationFrame(animate);

            if (!prefersReducedMotion) {
                time += SETTINGS.animationSpeed;

                // 1. Forest Sway (simulating wind)
                // We rotate the entire forest group very slowly on a sine wave
                forestGroup.rotation.z = Math.sin(time) * SETTINGS.swayIntensity * 0.5;
                forestGroup.rotation.x = Math.cos(time * 0.7) * SETTINGS.swayIntensity * 0.2;

                // 2. Camera Drift
                // Gentle parallax motion
                camera.position.x = Math.sin(time * 0.5) * 1.0;
                camera.position.y = 5 + Math.cos(time * 0.3) * 0.5;
                camera.lookAt(0, 8, 0);

                // 3. Particle Float
                const positions = particleSystem.geometry.attributes.position.array;
                for (let i = 0; i < SETTINGS.particles; i++) {
                    const idx = i * 3;
                    // Move up slowly
                    positions[idx + 1] += 0.01; 
                    // Wiggle on X and Z
                    positions[idx] += Math.sin(time * 2 + i) * 0.002;
                    positions[idx + 2] += Math.cos(time * 1.5 + i) * 0.002;

                    // Reset if too high
                    if (positions[idx + 1] > 20) {
                        positions[idx + 1] = -5;
                    }
                }
                particleSystem.geometry.attributes.position.needsUpdate = true;
            }
            
            renderer.render(scene, camera);
        }

        function handleResize() {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }

        // Start
        init();

    </script>
</body>
</html>`;
