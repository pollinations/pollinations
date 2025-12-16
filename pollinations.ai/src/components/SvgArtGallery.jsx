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
