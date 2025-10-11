import React from "react";
import styled from "@emotion/styled";
import SvgArtGenerator from "./SvgArtGenerator";
import Grid from "@mui/material/Grid";

const GalleryContainer = styled.div`
  padding: 2rem;
  width: 100%;
  box-sizing: border-box;
`;

const GalleryItem = styled.div`
  position: relative;
  margin-bottom: 2rem;
`;

const ItemLabel = styled.div`
  position: absolute;
  top: 10px;
  left: 10px;
  background: rgba(0, 0, 0, 0.5);
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.8rem;
  z-index: 1;
`;

const presets = {
    neural: {
        name: "Neural Gardens",
        prompt: "Create an abstract visualization of neural connectivity patterns. Use flowing curves and translucent layers to suggest information flow. Avoid literal neuron representations, focus on dynamic network topology with subtle pulsing animations.",
        temperature: 0.8,
    },
    biomorphic: {
        prompt: "Generate abstract organic patterns inspired by microscopic life. Create flowing, interconnected forms that morph and evolve. Use subtle animations to suggest growth and transformation. Focus on rhythm and continuous motion rather than specific biological structures.",
        temperature: 0.9,
    },
    boids: {
        prompt: "Create abstract flowing fields of motion suggesting collective movement. Use simple geometric elements that respond to invisible forces. Animate smooth transitions and emergent patterns. Focus on the poetry of motion rather than literal representations.",
        temperature: 0.85,
    },
    retrogame: {
        prompt: "Generate abstract geometric compositions inspired by early computer graphics. Use basic shapes, limited color palettes, and precise mathematical patterns. Include subtle animations that suggest computational processes. Focus on pure form rather than game elements.",
        temperature: 0.85,
    },
    solarpunk: {
        prompt: "Create abstract patterns suggesting harmony between organic and technological elements. Use flowing curves intersecting with geometric structures. Animate subtle transitions between natural and artificial forms. Focus on the underlying rhythm rather than literal scenes.",
        temperature: 0.9,
    },
    isometric: {
        prompt: "Generate abstract geometric patterns based on impossible mathematics. Create interlocking shapes that defy conventional perspective. Use subtle animations to shift spatial relationships. Focus on pure geometric relationships rather than architectural elements.",
        temperature: 0.8,
    },
    cellular: {
        prompt: "Visualize abstract cellular automata patterns with artistic interpretation. Create evolving geometric forms that pulse and transform. Use smooth transitions between states. Focus on the mathematical beauty of emergent patterns.",
        temperature: 0.85,
    },
    bauhaus: {
        prompt: "Create pure geometric abstractions inspired by modernist principles. Use primary colors and basic shapes in dynamic compositions. Include subtle rotations and translations. Focus on fundamental visual relationships and rhythm.",
        temperature: 0.7,
    },
    quantum: {
        prompt: "Generate abstract patterns suggesting quantum probability fields. Create flowing, overlapping waves of possibility. Use ethereal animations to suggest quantum uncertainty. Focus on the poetry of probability rather than scientific illustration.",
        temperature: 0.95,
    },
    cosmology: {
        prompt: "Create abstract patterns suggesting cosmic forces and fields. Generate flowing forms that suggest gravitational influence. Use subtle animations to imply vast scales of space and time. Focus on underlying forces rather than celestial objects.",
        temperature: 0.85,
    },
    meditation: {
        prompt: "Generate abstract patterns that induce contemplative states. Create flowing, symmetric forms that pulse with gentle rhythm. Use subtle animations that guide breath and attention. Focus on pure form rather than symbolic elements.",
        temperature: 0.8,
    },
    emergence: {
        prompt: "Create abstract patterns showing complex behavior emerging from simple rules. Generate flowing forms that suggest collective organization. Use subtle animations to reveal underlying patterns. Focus on the beauty of emergence rather than specific systems.",
        temperature: 0.85,
    },
    digitalNature: {
        prompt: "Generate abstract patterns fusing organic and digital aesthetics. Create flowing forms that transition between natural and computational states. Use subtle animations to suggest transformation. Focus on the underlying harmony rather than literal representations.",
        temperature: 0.9,
    },
    hexGrid: {
        name: "Hex Grid Flow",
        prompt: "Create a repeating pattern of hexagons that pulse and flow. Each hexagon should contain similar internal geometric patterns that animate subtly. Use groups of shapes that can be reused across the grid. Add wave-like movements that ripple through the entire pattern.",
        temperature: 0.75,
    },
    voronoiTessellation: {
        name: "Voronoi Waves",
        prompt: "Generate an organic Voronoi tessellation pattern. Create cell-like shapes that share common elements and animations. Use groups of geometric patterns that repeat within each cell. Add subtle pulsing movements that spread across the tessellation.",
        temperature: 0.8,
    },
    circuitryMesh: {
        name: "Circuit Mesh",
        prompt: "Design a dense pattern of circuit-like paths using repeating geometric elements. Create modular groups of paths that can tile seamlessly. Add subtle data-flow animations that traverse the circuit paths. Use minimal color variations to maintain visual cohesion.",
        temperature: 0.7,
    },
    crystalLattice: {
        name: "Crystal Lattice",
        prompt: "Generate a crystalline lattice pattern with repeating geometric nodes. Create groups of angular shapes that interconnect and pulse in unison. Add subtle rotations and scaling animations that propagate through the structure. Focus on symmetry and regular spacing.",
        temperature: 0.75,
    },
    waveInterference: {
        name: "Wave Interference",
        prompt: "Create overlapping wave patterns using repeating curved elements. Generate interference-like effects through layered animations. Use groups of similar wave forms that create moiré-like patterns. Add subtle phase shifts in the animations.",
        temperature: 0.85,
    },
    fracturedTiles: {
        name: "Fractured Tiles",
        prompt: "Design a pattern of broken geometric tiles that share common elements. Create groups of angular shapes that can be reused across the pattern. Add subtle shifting animations that suggest tectonic movement. Use consistent internal patterns within each tile.",
        temperature: 0.8,
    },
    molecularGrid: {
        name: "Molecular Grid",
        prompt: "Generate a grid of molecular-like structures using repeating circular elements. Create groups of interconnected rings that can tile the space. Add subtle orbital animations that maintain pattern consistency. Focus on geometric precision and regular spacing.",
        temperature: 0.75,
    },
    flowFields: {
        name: "Flow Fields",
        prompt: "Create a pattern of flowing lines that follow invisible force fields. Generate groups of similar curve patterns that can be repeated. Add subtle animations that suggest fluid dynamics. Use consistent stroke weights and spacing throughout.",
        temperature: 0.85,
    },
    recursiveSplits: {
        name: "Recursive Splits",
        prompt: "Design a pattern of recursively splitting shapes that share common elements. Create groups of self-similar forms that can tile the space. Add subtle scaling animations that maintain geometric relationships. Focus on hierarchical organization.",
        temperature: 0.8,
    },
    modulatedGrid: {
        name: "Modulated Grid",
        prompt: "Generate a grid pattern with modulated elements that share common features. Create groups of shapes that respond to invisible sine waves. Add subtle undulating animations that affect the entire grid. Use consistent spacing and proportions.",
        temperature: 0.75,
    },
    symbioticMesh: {
        name: "Symbiotic Mesh",
        prompt: "Create an organic mesh pattern where elements grow and interact. Generate groups of biomorphic shapes that can be repeated. Add subtle growth animations that maintain pattern cohesion. Focus on interconnected relationships between elements.",
        temperature: 0.85,
    },
    dataMatrix: {
        name: "Data Matrix",
        prompt: "Design a matrix of data-like elements using repeating geometric symbols. Create groups of abstract glyphs that can tile the space. Add subtle transformation animations that suggest data flow. Use consistent spacing and alignment.",
        temperature: 0.7,
    },
    resonancePatterns: {
        name: "Resonance Patterns",
        prompt: "Generate patterns inspired by resonance phenomena using repeating elements. Create groups of shapes that appear to vibrate in harmony. Add subtle frequency-based animations that maintain pattern stability. Focus on wave-like behaviors.",
        temperature: 0.8,
    },
    topographicFlow: {
        name: "Topographic Flow",
        prompt: "Create a pattern of topographic-like contours using repeating curved lines. Generate groups of similar contour patterns that can tile seamlessly. Add subtle flowing animations that suggest terrain changes. Use consistent line weights and spacing.",
        temperature: 0.85,
    },
    quantumLattice: {
        name: "Quantum Lattice",
        prompt: "Design a lattice pattern inspired by quantum probability fields. Create groups of wave-like forms that can be repeated. Add subtle phase-shift animations that maintain pattern coherence. Focus on interference-like effects.",
        temperature: 0.9,
    },
    mycelialWeb: {
        name: "Mycelial Web",
        prompt: "Generate a pattern of branching, fungal-like networks using repeating elements. Create groups of similar branching structures that can tile the space. Add subtle growth animations that maintain network connectivity. Focus on organic spreading patterns.",
        temperature: 0.85,
    },
    diffusionFields: {
        name: "Diffusion Fields",
        prompt: "Create patterns inspired by diffusion processes using repeating elements. Generate groups of gradient-like forms that can tile seamlessly. Add subtle spreading animations that maintain pattern continuity. Focus on smooth transitions between elements.",
        temperature: 0.8,
    },
    neuralOscillations: {
        name: "Neural Oscillations",
        prompt: "Design patterns of neural-like oscillations using repeating wave elements. Create groups of synchronized waveforms that can tile the space. Add subtle phase-locked animations that maintain rhythm. Focus on coordinated movements across the pattern.",
        temperature: 0.85,
    },
    crystallineFlow: {
        name: "Crystalline Flow",
        prompt: "Generate patterns that combine crystalline structure with fluid movement. Create groups of geometric shapes that flow like liquid. Add subtle morphing animations that preserve pattern structure. Focus on the tension between order and fluidity.",
        temperature: 0.8,
    },
    morphogenicField: {
        name: "Morphogenic Field",
        prompt: "Create patterns inspired by morphogenetic fields using repeating cellular elements. Generate groups of similar cell-like forms that can tile seamlessly. Add subtle growth animations that maintain pattern organization. Focus on developmental-like processes.",
        temperature: 0.85,
    },
    neural: {
        name: "Neural Networks",
        prompt: "Create a dense, space-filling network pattern using only black, white, and lime (#FFE801). Define a reusable group of interconnected nodes and paths that can be repeated and rotated. Fill the entire space with multiple scales of this pattern, creating a self-similar neural network. Use black for main structures, lime for highlights, and white for background. Add subtle pulse animations that propagate through the connections. Use at least 50 instances of the base pattern.",
        temperature: 0.7,
    },
    biomorphic: {
        name: "Biomorphic Systems",
        prompt: "Generate a dense biological pattern system using only black, white, and lime (#FFE801). Define a reusable group of organic shapes that can grow and divide. Use black for primary forms, lime for accent elements, and white for negative space. Fill the entire canvas with this pattern at multiple scales, creating a self-similar living texture. Include at least 100 instances of the base pattern. Add subtle growth animations that maintain the dense coverage.",
        temperature: 0.8,
    },
    hexGrid: {
        name: "Hex Grid Flow",
        prompt: "Create a dense hexagonal grid system using only black, white, and lime (#FFE801). Define a reusable hexagon group with internal geometric patterns. Use black for grid lines, lime for selected hexagons, and white for background. Fill the entire space with at least 200 hexagons at different scales. Create a self-similar pattern where each hexagon contains smaller hexagons. Add wave-like animations that ripple through the entire grid structure.",
        temperature: 0.7,
    },
    voronoiTessellation: {
        name: "Voronoi Mesh",
        prompt: "Generate a dense Voronoi tessellation using only black, white, and lime (#FFE801). Define a reusable group of cells with internal patterns that can be reflected and rotated. Use black for primary cells, lime for accent elements, and white for background. Fill the entire space with at least 150 cells at multiple scales. Create a self-similar pattern where each cell contains smaller cells. Add subtle pulsing animations that spread across the mesh.",
        temperature: 0.75,
    },
    circuitryMesh: {
        name: "Circuit Matrix",
        prompt: "Design a dense circuit pattern system using only black, white, and lime (#FFE801). Define a reusable group of circuit paths and nodes that can be rotated and connected. Use black for primary circuits, lime for active nodes, and white for background. Fill the entire space with at least 300 circuit elements at different scales. Create a self-similar pattern where each circuit contains smaller circuits. Add data-flow animations that traverse the entire network.",
        temperature: 0.7,
    },
    crystalLattice: {
        name: "Crystal Growth",
        prompt: "Generate a dense crystalline growth pattern using only black, white, and lime (#FFE801). Define a reusable group of geometric crystal shapes that can be repeated and reflected. Use black for primary crystals, lime for accent elements, and white for background. Fill the entire space with at least 250 crystal elements at multiple scales. Create a self-similar pattern where each crystal contains smaller crystals. Add subtle growth animations that maintain the lattice structure.",
        temperature: 0.7,
    },
    waveInterference: {
        name: "Wave Fields",
        prompt: "Create a dense interference pattern system using only black, white, and lime (#FFE801). Define a reusable group of wave elements that can be overlapped and phase-shifted. Use black and white for the primary wave pattern, with lime accents for dynamic elements. Fill the entire space with at least 400 wave elements at different scales. Create a self-similar pattern where each wave contains smaller waves. Add subtle phase animations that create moving moiré effects.",
        temperature: 0.8,
    },
    fracturedTiles: {
        name: "Fractal Tiles",
        prompt: "Design a dense fractal tiling system using only black, white, and lime (#FFE801). Define a reusable group of geometric shapes that can be recursively subdivided. Use black for primary tiles, lime for accent elements, and white for background. Fill the entire space with at least 200 tiles at multiple scales. Create a self-similar pattern where each tile contains smaller versions of itself. Add subtle shift animations that maintain the fractal structure.",
        temperature: 0.75,
    },
    flowFields: {
        name: "Flow Systems",
        prompt: "Create a dense flow field pattern using only black, white, and lime (#FFE801). Define a reusable group of streamlines that can be repeated and warped. Use black for primary flows, lime for intersections, and white for background space. Fill the entire space with at least 500 flow elements at different scales. Add subtle animations that suggest continuous fluid movement across the entire field.",
        temperature: 0.8,
    },
    recursiveSplits: {
        name: "Recursive Patterns",
        prompt: "Generate a dense recursive splitting pattern using only black, white, and lime (#FFE801). Define a reusable group of shapes that can be recursively divided. Use black for primary divisions, lime for accent splits, and white for spacing. Fill the entire space with at least 300 elements at multiple scales. Create a self-similar pattern where each split reveals smaller splits. Add subtle scaling animations that preserve the recursive structure.",
        temperature: 0.75,
    },
    dataMatrix: {
        name: "Data Lattice",
        prompt: "Design a dense data visualization pattern using only black, white, and lime (#FFE801). Define reusable groups of abstract data glyphs that can be repeated in a grid. Use black for primary symbols, lime for active data points, and white for grid structure. Fill the entire space with at least 400 data elements at different scales. Add subtle transformation animations that suggest data flow.",
        temperature: 0.7,
    },
    resonancePatterns: {
        name: "Resonance Fields",
        prompt: "Generate a dense resonance pattern system using only black, white, and lime (#FFE801). Define a reusable group of resonating elements that can be synchronized. Use black for primary resonators, lime for accent elements, and white for background. Fill the entire space with at least 300 resonators at multiple scales. Create a self-similar pattern where each resonator affects smaller resonators. Add subtle frequency-based animations that create standing wave patterns.",
        temperature: 0.75,
    },
    quantumLattice: {
        name: "Quantum Fields",
        prompt: "Create a dense quantum probability field pattern using only black, white, and lime (#FFE801). Define a reusable group of wave function elements that can interfere. Use black and white for the primary wave pattern, with lime accents for dynamic elements. Fill the entire space with at least 400 quantum elements at different scales. Create a self-similar pattern where each wave contains smaller waves. Add subtle phase-shift animations that suggest quantum behavior.",
        temperature: 0.8,
    },
    mycelialWeb: {
        name: "Mycelial Networks",
        prompt: "Generate a dense fungal network pattern using only black, white, and lime (#FFE801). Define a reusable group of branching structures that can grow and connect. Use black for primary branches, lime for accent elements, and white for background. Fill the entire space with at least 500 mycelial elements at multiple scales. Create a self-similar pattern where each branch contains smaller branches. Add subtle growth animations that maintain network connectivity.",
        temperature: 0.75,
    },
    diffusionFields: {
        name: "Diffusion Systems",
        prompt: "Create a dense diffusion pattern system using only black, white, and lime (#FFE801). Define a reusable group of diffusing elements that can spread and merge. Use black for primary diffusions, lime for accent elements, and white for background. Fill the entire space with at least 300 diffusion patterns at different scales. Create a self-similar pattern where each diffusion creates smaller diffusions. Add subtle spreading animations that maintain pattern continuity.",
        temperature: 0.75,
    },
    bauhausGrid: {
        name: "Bauhaus Grid",
        prompt: "Create a dense Bauhaus-inspired grid system using only black, white, and lime (#FFE801). Define reusable groups of primary geometric shapes (circles, squares, triangles) in black, white, and lime. Fill the entire space with at least 200 elements at different scales. Create overlapping compositions with strong horizontal and vertical lines. Add subtle rotational animations that maintain geometric precision. Reference László Moholy-Nagy's style.",
        temperature: 0.7,
    },
    mondrianComposition: {
        name: "Mondrian Rhythm",
        prompt: "Generate a Neo-Plasticism pattern system inspired by Piet Mondrian using only black, white, and lime (#FFE801). Define reusable groups of rectangular shapes divided by bold black lines. Use black for primary lines, lime for accent rectangles, and white for background. Fill the space with at least 100 rectangles, some filled with lime. Create a dynamic balance between different sized rectangles. Add subtle animations where lines shift position while maintaining perpendicular relationships.",
        temperature: 0.7,
    },
    bridgetRileyWaves: {
        name: "Op Art Waves",
        prompt: "Create an Op Art pattern system using only black, white, and lime (#FFE801) for maximum contrast. Define reusable groups of precise parallel lines that create optical effects. Use alternating black and white for the main pattern, with lime accents for dynamic elements. Fill the entire space with at least 500 lines at varying frequencies. Create wave patterns that generate moiré effects. Add subtle phase-shift animations that create illusions of movement.",
        temperature: 0.7,
    },
    kandinskyCurves: {
        name: "Kandinsky Abstract",
        prompt: "Generate an abstract pattern system inspired by Wassily Kandinsky using only black, white, and lime (#FFE801). Define reusable groups of musical-inspired shapes (circles, curves, angles) in black, white, and lime. Fill the space with at least 300 elements in bold colors. Create dynamic compositions with floating geometric forms. Add subtle pulsing animations that suggest rhythm and movement.",
        temperature: 0.8,
    },
    suprematistDynamic: {
        name: "Suprematist Space",
        prompt: "Create a Suprematist pattern system inspired by Kazimir Malevich using only black, white, and lime (#FFE801). Define reusable groups of bold geometric shapes floating in space. Use black for primary shapes, lime for accent elements, and white for background. Fill the canvas with at least 150 elements of different scales. Create dynamic diagonal compositions with black, white, and lime shapes. Add subtle rotational animations that maintain geometric purity.",
        temperature: 0.75,
    },
    memphisPattern: {
        name: "Memphis Grid",
        prompt: "Generate a Memphis Group-inspired pattern system using only black, white, and lime (#FFE801). Define reusable groups of bold 1980s geometric shapes and squiggles in black, white, and lime. Fill the space with at least 200 elements in bright colors and black/white patterns. Create layered compositions with confetti-like arrangements. Add playful animations that maintain the postmodern aesthetic.",
        temperature: 0.85,
    },
    constructivistGrid: {
        name: "Constructivist Dynamic",
        prompt: "Create a Constructivist-inspired pattern system using only black, white, and lime (#FFE801). Define reusable groups of industrial shapes and diagonal lines. Use black for bold forms, lime for dynamic elements, and white for spatial separation. Fill the space with at least 250 elements. Create dynamic diagonal compositions with strong geometric forms. Add mechanical-like animations that suggest industrial movement.",
        temperature: 0.75,
    },
    deStijlRhythm: {
        name: "De Stijl Rhythm",
        prompt: "Generate a De Stijl pattern system using only black, white, and lime (#FFE801). Define reusable groups of rectangular forms and lines. Use black for primary lines, lime for accent rectangles, and white for background. Fill the entire space with at least 180 elements using only straight lines and primary colors. Create asymmetric balance with varying rectangle sizes. Add subtle sliding animations that maintain perpendicular relationships.",
        temperature: 0.7,
    },
    esherTessellation: {
        name: "Escher Transforms",
        prompt: "Create a tessellation pattern system using only black, white, and lime (#FFE801). Define reusable groups of interlocking geometric shapes. Use black for primary forms, lime for transitioning elements, and white for background. Fill the space with at least 300 elements that transform gradually. Create seamless metamorphosis patterns. Add subtle morphing animations that maintain perfect tessellation.",
        temperature: 0.8,
    },
    vasarelyIllusion: {
        name: "Vasarely Vega",
        prompt: "Generate an Op Art pattern system using only black, white, and lime (#FFE801). Define reusable groups of geometric shapes that create 3D illusions. Use black and white for the primary grid distortion, with lime highlights for depth emphasis. Fill the space with at least 400 elements that suggest depth. Add subtle scaling animations that enhance the illusion of volume.",
        temperature: 0.75,
    },
    albersSyncopation: {
        name: "Albers Squares",
        prompt: "Create a pattern system inspired by Josef Albers' Homage to the Square using only black, white, and lime (#FFE801). Define reusable groups of nested squares with precise color relationships. Use black for primary squares, lime for accent squares, and white for background. Fill the space with at least 100 square sets. Create subtle variations in color and size. Add barely perceptible color-shift animations that explore color interaction.",
        temperature: 0.7,
    },
    nolandStripes: {
        name: "Noland Stripes",
        prompt: "Generate a Color Field pattern system inspired by Kenneth Noland using only black, white, and lime (#FFE801). Define reusable groups of precise colored stripes and chevrons. Use black for primary stripes, lime for accent stripes, and white for background. Fill the space with at least 200 stripe elements. Create rhythmic color relationships with hard edges. Add subtle width-change animations that maintain color field purity.",
        temperature: 0.7,
    },
    stellaGeometric: {
        name: "Stella Geometry",
        prompt: "Create a pattern system inspired by Frank Stella's geometric works using only black, white, and lime (#FFE801). Define reusable groups of concentric shapes and protractor forms. Use black for primary shapes, lime for accent elements, and white for background. Fill the space with at least 250 elements in bold colors. Create interlocking geometric patterns. Add subtle rotational animations that maintain mathematical precision.",
        temperature: 0.75,
    },
    lewittStructures: {
        name: "LeWitt Systems",
        prompt: "Generate a systematic pattern using only black, white, and lime (#FFE801). Define reusable groups of lines following strict rules. Use black for primary lines, lime for intersections, and white for background. Fill the space with at least 500 lines that create emergent patterns. Create geometric progressions and permutations. Add subtle drawing animations that follow systematic rules.",
        temperature: 0.7,
    },
    kellyShapes: {
        name: "Kelly Forms",
        prompt: "Create a pattern system inspired by Ellsworth Kelly using only black, white, and lime (#FFE801). Define reusable groups of pure, hard-edged shapes. Use black for primary shapes, lime for accent shapes, and white for background. Fill the space with at least 150 elements in solid colors. Create compositions of simple, bold forms. Add subtle position-shift animations that maintain shape clarity.",
        temperature: 0.7,
    },
};

const SvgArtGallery = () => {
    return (
        <GalleryContainer>
            <Grid container spacing={3}>
                {Object.entries(presets).map(([key, preset]) => (
                    <Grid item xs={12} sm={6} md={4} lg={3} key={key}>
                        <GalleryItem>
                            <ItemLabel>{preset.name || key}</ItemLabel>
                            <SvgArtGenerator
                                width={300}
                                height={300}
                                prompt={preset.prompt}
                                temperature={preset.temperature}
                            />
                        </GalleryItem>
                    </Grid>
                ))}
            </Grid>
        </GalleryContainer>
    );
};

export default SvgArtGallery;
