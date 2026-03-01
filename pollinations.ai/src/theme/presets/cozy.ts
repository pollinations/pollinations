import { type LLMThemeResponse, processTheme } from "../style/theme-processor";

// === COLOR DEFINITIONS ===
// Extracted for future light mode: create cozy-light.ts, spread these, override surfaces/text
export const COZY_DARK_COLORS = {
    // Brand (shared across light/dark)
    brand: "#ecf874",
    mint: "#3dffc0",
    lavender: "#b366ff",
    peach: "#ff7744",

    // Text
    textPrimary: "#fff5eb",
    textSecondary: "#e8dcc8",
    textTertiary: "#b098d0",
    textCaption: "#9888b0",
    textInverse: "#110518",

    // Surfaces
    surfacePage: "#110518",
    surfaceCard: "#1a0b2e",
    surfaceBase: "#150920",

    // Input
    inputBg: "#1e0f35",
    inputBorder: "#3d2a5c",

    // Button
    buttonSecondaryBg: "#1e0f35",
    buttonDisabledBg: "#1a0b2e",
    buttonPrimaryBorder: "#c8d45a",

    // Borders
    borderMain: "#2d1b4e",
    borderStrong: "#3d2a5c",
    borderSubtle: "#1e0f35",
    borderFaint: "#150920",

    // Shadows
    shadowDark: "#0d0312",
} as const;

const C = COZY_DARK_COLORS;

export const CozyTheme: LLMThemeResponse = {
    slots: {
        slot_0: { hex: C.textPrimary, ids: ["text.primary"] },
        slot_1: { hex: C.textSecondary, ids: ["text.secondary"] },
        slot_2: { hex: C.textTertiary, ids: ["text.tertiary"] },
        slot_3: {
            hex: C.textCaption,
            ids: ["text.caption", "input.placeholder"],
        },
        slot_4: {
            hex: C.textInverse,
            ids: ["text.inverse", "surface.page", "background.base"],
        },
        slot_5: {
            hex: C.brand,
            ids: [
                "text.brand",
                "button.primary.bg",
                "border.brand",
                "indicator.text",
                "background.element1",
                "logo.main",
                "shadow.brand.sm",
                "shadow.brand.md",
                "shadow.brand.lg",
            ],
        },
        slot_6: {
            hex: C.mint,
            ids: [
                "text.highlight",
                "button.focus.ring",
                "border.highlight",
                "indicator.video",
                "background.particle",
                "logo.accent",
                "shadow.highlight.sm",
                "shadow.highlight.md",
            ],
        },
        slot_7: {
            hex: C.peach,
            ids: ["text.accent", "border.accent", "indicator.audio"],
        },
        slot_8: {
            hex: C.lavender,
            ids: [
                "button.secondary.border",
                "indicator.image",
                "background.element2",
            ],
        },
        slot_9: { hex: C.textPrimary, ids: ["input.text"] },
        slot_10: { hex: C.surfaceCard, ids: ["surface.card"] },
        slot_11: { hex: C.surfaceBase, ids: ["surface.base"] },
        slot_12: { hex: C.inputBg, ids: ["input.bg"] },
        slot_13: { hex: C.inputBorder, ids: ["input.border"] },
        slot_14: { hex: C.buttonPrimaryBorder, ids: ["button.primary.border"] },
        slot_15: { hex: C.buttonSecondaryBg, ids: ["button.secondary.bg"] },
        slot_16: { hex: C.buttonDisabledBg, ids: ["button.disabled.bg"] },
        slot_17: { hex: C.brand, ids: ["button.hover.overlay"] },
        slot_18: { hex: C.brand, ids: ["button.active.overlay"] },
        slot_19: { hex: C.borderMain, ids: ["border.main"] },
        slot_20: { hex: C.borderStrong, ids: ["border.strong"] },
        slot_21: { hex: C.borderSubtle, ids: ["border.subtle"] },
        slot_22: { hex: C.borderFaint, ids: ["border.faint"] },
        slot_23: {
            hex: C.shadowDark,
            ids: [
                "shadow.dark.sm",
                "shadow.dark.md",
                "shadow.dark.lg",
                "shadow.dark.xl",
            ],
        },
    },
    borderRadius: {
        "radius.button": "0px",
        "radius.card": "0px",
        "radius.input": "0px",
        "radius.subcard": "0px",
        "radius.tag": "0px",
    },
    fonts: {
        "font.title": "Pixelify Sans",
        "font.headline": "Pixelify Sans",
        "font.body": "Outfit",
    },
    opacity: {
        "opacity.card": "0.70",
        "opacity.overlay": "0.80",
        "opacity.glass": "0.55",
    },
};

export const CozyCssVariables = processTheme(CozyTheme).cssVariables;

export const CozyBackgroundHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cozy Pixel Garden</title>
    <style>
        body, html {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
            background-color: {{BACKGROUND_BASE}};
        }
        canvas { display: block; width: 100%; height: 100%; }
        .scanlines {
            position: fixed; inset: 0; pointer-events: none; z-index: 1;
            background: repeating-linear-gradient(
                0deg,
                transparent,
                transparent 2px,
                rgba(0,0,0,0.03) 2px,
                rgba(0,0,0,0.03) 4px
            );
        }
        .vignette {
            position: fixed; inset: 0; pointer-events: none; z-index: 2;
            background: radial-gradient(ellipse at center, transparent 55%, rgba(17,5,24,0.5) 100%);
        }
    </style>
</head>
<body>
    <div class="scanlines"></div>
    <div class="vignette"></div>
    <script type="module">
        import * as THREE from 'https://esm.sh/three';

        const COLORS = {
            background: '{{BACKGROUND_BASE}}',
            primary: '{{BACKGROUND_ELEMENT1}}',
            secondary: '{{BACKGROUND_ELEMENT2}}',
            particles: '{{BACKGROUND_PARTICLE}}'
        };

        let scene, camera, renderer;
        let time = 0;
        let width, height;
        let voxels = [];
        let particles;
        let gridLines;
        let mouseX = 0, mouseY = 0;

        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        function init() {
            width = window.innerWidth;
            height = window.innerHeight;

            scene = new THREE.Scene();
            scene.background = new THREE.Color(COLORS.background);
            scene.fog = new THREE.FogExp2(COLORS.background, 0.025);

            camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 120);
            camera.position.z = 30;

            renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
            renderer.setSize(width, height);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            document.body.appendChild(renderer.domElement);

            createGrid();
            createVoxels();
            createParticles();

            window.addEventListener('resize', onResize, false);
            document.addEventListener('mousemove', onMouse, false);
            requestAnimationFrame(animate);
        }

        // Subtle grid plane
        function createGrid() {
            const size = 80;
            const divisions = 20;
            const gridColor = new THREE.Color(COLORS.primary);

            const grid = new THREE.GridHelper(size, divisions, gridColor, gridColor);
            grid.material.transparent = true;
            grid.material.opacity = 0.04;
            grid.material.depthWrite = false;
            grid.position.y = -12;
            grid.rotation.x = 0;
            scene.add(grid);
            gridLines = grid;
        }

        // Chunky voxel cubes floating around
        function createVoxels() {
            const count = 25;
            const boxGeo = new THREE.BoxGeometry(1, 1, 1);
            const edgesGeo = new THREE.EdgesGeometry(boxGeo);

            const colors = [COLORS.primary, COLORS.secondary, COLORS.particles];

            for (let i = 0; i < count; i++) {
                const group = new THREE.Group();
                const colorIdx = i % colors.length;
                const hex = colors[colorIdx];

                // Solid face with low opacity
                const faceMat = new THREE.MeshBasicMaterial({
                    color: hex,
                    transparent: true,
                    opacity: 0.08,
                    depthWrite: false,
                });
                const face = new THREE.Mesh(boxGeo, faceMat);

                // Wireframe edges — the pixel-art outline look
                const edgeMat = new THREE.LineBasicMaterial({
                    color: hex,
                    transparent: true,
                    opacity: 0.35,
                    depthWrite: false,
                });
                const edges = new THREE.LineSegments(edgesGeo, edgeMat);

                group.add(face);
                group.add(edges);

                const x = (Math.random() - 0.5) * 50;
                const y = (Math.random() - 0.5) * 30;
                const z = (Math.random() - 0.5) * 25;
                group.position.set(x, y, z);

                const s = 0.4 + Math.random() * 1.2;
                group.scale.setScalar(s);

                group.userData = {
                    origin: new THREE.Vector3(x, y, z),
                    phase: Math.random() * Math.PI * 2,
                    rotSpeed: (Math.random() - 0.5) * 0.003,
                    bobSpeed: 0.3 + Math.random() * 0.4,
                    bobAmp: 0.5 + Math.random() * 1.5,
                };

                scene.add(group);
                voxels.push(group);
            }
        }

        // Square-ish pixel particles (small cubes rendered as points won't look square,
        // so we use a custom sprite texture)
        function createParticles() {
            const count = 120;
            const geo = new THREE.BufferGeometry();
            const positions = new Float32Array(count * 3);
            const sizes = new Float32Array(count);

            for (let i = 0; i < count; i++) {
                positions[i * 3] = (Math.random() - 0.5) * 60;
                positions[i * 3 + 1] = (Math.random() - 0.5) * 40;
                positions[i * 3 + 2] = (Math.random() - 0.5) * 30;
                sizes[i] = 0.1 + Math.random() * 0.2;
            }

            geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

            // Create a tiny square texture for pixel-style particles
            const canvas = document.createElement('canvas');
            canvas.width = 4;
            canvas.height = 4;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, 4, 4);
            const tex = new THREE.CanvasTexture(canvas);
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;

            const mat = new THREE.PointsMaterial({
                color: COLORS.particles,
                size: 0.25,
                map: tex,
                transparent: true,
                opacity: 0.5,
                depthWrite: false,
                sizeAttenuation: true,
            });

            particles = new THREE.Points(geo, mat);
            scene.add(particles);
        }

        function animate() {
            requestAnimationFrame(animate);

            const now = performance.now();
            if (!time) time = now;
            time = now;

            const speed = prefersReducedMotion ? 0.1 : 1.0;
            const t = now * 0.001 * speed;

            // Animate voxels: bob, drift, slow rotation
            for (const v of voxels) {
                const d = v.userData;
                v.position.y = d.origin.y + Math.sin(t * d.bobSpeed + d.phase) * d.bobAmp;
                v.position.x = d.origin.x + Math.cos(t * 0.3 + d.phase) * 0.4;
                v.rotation.x += d.rotSpeed * speed;
                v.rotation.y += d.rotSpeed * 0.7 * speed;

                // Twinkle: modulate edge opacity
                const edgeMesh = v.children[1];
                if (edgeMesh && edgeMesh.material) {
                    edgeMesh.material.opacity = 0.25 + Math.sin(t * 1.5 + d.phase) * 0.1;
                }
            }

            // Animate particles: gentle upward drift
            if (particles) {
                const pos = particles.geometry.attributes.position.array;
                for (let i = 0; i < pos.length; i += 3) {
                    pos[i + 1] += 0.008 * speed;
                    if (pos[i + 1] > 20) pos[i + 1] = -20;
                }
                particles.geometry.attributes.position.needsUpdate = true;
                particles.rotation.y = Math.sin(t * 0.05) * 0.08;
            }

            // Grid subtle pulse
            if (gridLines && gridLines.material) {
                gridLines.material.opacity = 0.03 + Math.sin(t * 0.4) * 0.01;
            }

            // Camera: gentle parallax
            if (!prefersReducedMotion) {
                camera.position.x += (mouseX * 0.8 - camera.position.x) * 0.03;
                camera.position.y += (-mouseY * 0.5 - camera.position.y) * 0.03;
                camera.lookAt(scene.position);
            }

            renderer.render(scene, camera);
        }

        function onResize() {
            width = window.innerWidth;
            height = window.innerHeight;
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            renderer.setSize(width, height);
        }

        function onMouse(e) {
            mouseX = (e.clientX / width) * 2 - 1;
            mouseY = (e.clientY / height) * 2 - 1;
        }

        init();
    </script>
</body>
</html>`;
