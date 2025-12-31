// const prompts = [
//     "professional 3d model {prompt} . octane render, highly detailed, volumetric, dramatic lighting",
//     "analog film photo {prompt} . faded film, desaturated, 35mm photo, grainy, vignette, vintage, Kodachrome, Lomography, found footage",
//     "anime artwork {prompt} . anime style, key visual, vibrant, studio anime, highly detailed",
//     "{prompt} . shallow depth of field, vignette, highly detailed, high budget, bokeh, moody, epic, gorgeous, film grain, grainy",
//     "comic {prompt} . graphic illustration, comic art, graphic novel art, vibrant, highly detailed",
//     "play-doh style {prompt} . sculpture, clay art, centered composition, Claymation",
//     "breathtaking {prompt} . award-winning, professional, highly detailed",
//     "ethereal fantasy concept art of  {prompt} . magnificent, celestial, ethereal, painterly, epic, majestic, magical, fantasy art, cover art, dreamy",
//     "isometric style {prompt} . vibrant, beautiful, crisp, detailed, ultra detailed, intricate",
//     "line art drawing {prompt} . professional, sleek, modern, minimalist, graphic, line art, vector graphics",
//     "low-poly style {prompt} . low-poly game art, polygon mesh, jagged, blocky, wireframe edges, centered composition",
//     "neonpunk style {prompt} . cyberpunk, vaporwave, neon, vibes, vibrant, stunningly beautiful, crisp, detailed, sleek, ultramodern",
//     "origami style {prompt} . paper art, pleated paper, folded, origami art, pleats, cut and fold, centered composition",
//     "pixel-art {prompt} . low-res, blocky, pixel art style, 8-bit graphics",
//     "cinematic still {prompt} . emotional, harmonious, vignette, highly detailed, high budget, bokeh, cinemascope, moody, gorgeous, film grain, grainy",
//     "cinematic photo {prompt} . 35mm photograph, film, bokeh, professional, 4k, highly detailed",
//     "anime artwork {prompt} . anime style, key visual, vibrant, studio anime,  highly detailed",
//     "manga style {prompt} . vibrant, high-energy, detailed, iconic, Japanese comic style",
//     "concept art {prompt} . digital artwork, illustrative, painterly, matte painting, highly detailed",
//     "pixel-art {prompt} . low-res, blocky, pixel art style, 8-bit graphics",
//     "professional 3d model {prompt} . octane render, highly detailed, volumetric, dramatic lighting",
//     "glitch art portrait {prompt} . digital distortion, VHS overlay, retro cyber effects, pixelated errors",
//     "HDR urban photography {prompt} . high dynamic range, crisp details, vivid colors, cityscape focus",
//     "charcoal sketch {prompt} . rough textures, gradations of black and white, smudged shading, realistic",
//     "psychedelic abstract {prompt} . vibrant swirls, optical illusions, bold colors, reminiscent of 1960s art",
//     "8mm vintage travel film {prompt} . grainy texture, sepia tones, flickering effect, nostalgic feel",
//     "digital vector illustration {prompt} . clean lines, flat colors, Adobe Illustrator style, modern graphic",
//     "macro nature photography {prompt} . extreme close-up, detailed textures, bokeh background, vivid flora or fauna",
//     "gothic fantasy {prompt} . dark and brooding atmosphere, medieval architecture, mythical creatures",
//     "holographic 3D model {prompt} . futuristic, shimmering rainbow effects, translucent, light-interactive",
//     "experimental mixed media {prompt} . collage elements, diverse materials, avant-garde, textural contrasts",
//     "risograph art print {prompt} . layered colors, grainy texture, limited color palette, retro vibe",
//     "minimalist Scandinavian design {prompt} . clean lines, muted colors, functional and modern, natural elements",
//     "Japanese ink wash painting {prompt} . sumi-e style, brush strokes, monochrome, Zen-like simplicity",
//     "graffiti street art {prompt} . bold colors, urban style, spray paint textures, street culture",
//     "noir film scene {prompt} . black and white, high contrast, shadowy, 1940s detective film vibe",
//     "virtual reality landscape {prompt} . futuristic, immersive, 360-degree view, digital world",
//     "bioluminescent underwater scene {prompt} . glowing creatures, deep sea, mysterious, vibrant colors",
//     "medieval manuscript illustration {prompt} . illuminated letters, gold leaf, intricate borders, historical",
//     "surreal cosmic landscape {prompt} . otherworldly, starry skies, floating elements, dreamy colors",
//     "claymation character design {prompt} . stop-motion style, textured, whimsical, playful",
//     "woodblock print nature scene {prompt} . traditional Japanese style, layered, natural patterns",
//     "interactive 3D game environment {prompt} . immersive, realistic textures, dynamic lighting, engaging",
//     "pop art advertisement {prompt} . bold colors, comic style, 1960s vibe, catchy tagline",
//     "ambient mood scene {prompt} . soft lighting, calming colors, tranquil, soothing atmosphere",
//     "steampunk gadget design {prompt} . mechanical parts, bronze and copper, Victorian era, intricate gears",
//     "Cyberpunk city at night {prompt} . neon lights, futuristic buildings, dystopian, rain-soaked streets",
//     "Impressionist landscape painting {prompt} . quick brush strokes, light effects, vibrant, Monet-inspired",
//     "Cubist abstract composition {prompt} . geometric shapes, fragmented objects, Picasso-esque style",
//     "Candid urban photography {prompt} . spontaneous, street life, black and white, human elements",
//     "Augmented reality art experience {prompt} . immersive, interactive, blending real and virtual elements",
//     "Contemporary performance art scene {prompt} . dynamic, conceptual, human expression, avant-garde",
//     "Infrared landscape photography {prompt} . surreal colors, otherworldly, ethereal, nature-focused",
//     "Land art installation {prompt} . natural materials, outdoor setting, earthworks, environmental theme",
//     "Korean Minhwa painting {prompt} . folk art, vibrant colors, mythical creatures, traditional motifs",
//     "Stop-motion animation scene {prompt} . frame-by-frame, detailed, whimsical, story-driven",
//     "Political caricature {prompt} . exaggerated features, humorous, critical, editorial style",
//     "Eco-futuristic city design {prompt} . green architecture, sustainable living spaces, integration with nature",
//     "Victorian fashion sketch {prompt} . detailed period clothing, elegant postures, ornate accessories",
//     "Artistic gourmet dish presentation {prompt} . culinary art, creative plating, vibrant colors, gastronomy focus",
//     "West African mask design {prompt} . bold patterns, ritual significance, cultural symbolism",
//     "Surrealist dreamscape {prompt} . subconscious imagery, Freudian symbols, bizarre landscapes",
//     "Plein air city drawing {prompt} . on-site sketching, lively street scenes, watercolor and ink",
//     "Abstract animation sequence {prompt} . non-linear storytelling, experimental visuals, mixed media",
//     "Revivalist building design {prompt} . classical elements, symmetry, grandeur, inspired by Ancient Greece and Rome",
//     "Stained glass window design {prompt} . vibrant colors, light effects, intricate patterns",
//     "Ephemeral ice carving {prompt} . transparent beauty, temporary art, intricate details",
//     "Expressive art therapy painting {prompt} . emotional release, abstract expression, therapeutic process",
//     "Traditional puppet character {prompt} . handcrafted, intricate costumes, storytelling tools",
//     "Fantasy makeup look {prompt} . creative face painting, theatrical effects, character transformation",
//     "Ancient Mural Reconstruction {prompt} . historic scenes, faded frescoes, archaeological style",
//     "Rococo-Inspired Scene {prompt} . ornate, gold leaf, pastel colors, opulent, 18th-century elegance",
//     "Digital Glitch Art {prompt} . malfunction aesthetics, pixel shatter, color dispersion, modern digital",
//     "Art Brut/Outsider Art {prompt} . raw, non-conformist, intense expression, untrained artist style",
//     "Kinetic Sand Art {prompt} . flowing patterns, sand textures, dynamic, transient art",
//     "Psychedelic Poster Design {prompt} . 1960s revival, trippy visuals, bright neon, Hendrix-era vibe",
//     "Ice and Snow Sculpture {prompt} . winter festival, ephemeral frosty designs, ice carving details",
//     "Artisanal Jewelry Design {prompt} . handcrafted jewelry, intricate metalwork, gemstone details, luxury craftsmanship",
//     "Sandstone Carving {prompt} . ancient style, detailed relief work, weathered stone texture",
//     "Hyperrealistic Miniature Painting {prompt} . small scale, detailed brushwork, lifelike miniatures",
//     "Aerospace Concept Art {prompt} . futuristic spacecraft, interstellar travel, high-tech, NASA-inspired",
//     "Mandala Art {prompt} . symmetrical, intricate patterns, spiritual symbolism, colorful",
//     "Silhouette Animation {prompt} . contrast, shadow play, narrative storytelling, Lotte Reiniger style",
//     "Shadow Box Art {prompt} . layered paper, depth illusion, diorama style, intricate cutouts",
//     "Street Mural in 3D {prompt} . optical illusion, large-scale, urban art, interactive pavement",
//     "Art Therapy Collage {prompt} . mixed media, emotional expression, personal narratives, therapeutic process",
//     "Nail Art Design {prompt} . intricate patterns, miniature canvases, stylish, trendy",
//     "Lace Making {prompt} . delicate patterns, textile art, traditional craftsmanship, intricate",
//     "Botanical Illustration {prompt} . scientific accuracy, detailed plant life, naturalist style",
//     "Encaustic (Wax) Painting {prompt} . ancient technique, layered wax, textural, vibrant",
//     "Paper Quilling Art {prompt} . rolled paper, 3D effects, intricate designs, decorative",
//     "Neo-Expressionist Painting {prompt} . bold colors, emotive, modern abstraction, Basquiat-inspired",
//     // // with artists
//     // "Surrealist dreamscape {prompt} . subconscious imagery, Salvador Dali-inspired, bizarre landscapes",
//     // "Plein air city drawing {prompt} . on-site sketching, Edward Hopper style, watercolor and ink",
//     // "Abstract animation sequence {prompt} . non-linear storytelling, Norman McLaren-inspired, experimental visuals",
//     // "Revivalist building design {prompt} . neoclassical elements, symmetry, Andrea Palladio-inspired grandeur",
//     // "Stained glass window design {prompt} . vibrant colors, Louis Comfort Tiffany style, intricate patterns",
//     // "Ephemeral ice carving {prompt} . transparent beauty, Andy Goldsworthy-inspired, temporary art",
//     // "Expressive art therapy painting {prompt} . emotional release, Frida Kahlo-inspired, abstract expression",
//     // "Traditional puppet character {prompt} . handcrafted, Jim Henson-inspired, intricate costumes",
//     // "Fantasy makeup look {prompt} . creative face painting, Alex Box-inspired, theatrical effects",
//     // "Ancient Mural Reconstruction {prompt} . Pompeii-inspired, historic scenes, faded frescoes",
//     // "Rococo-Inspired Scene {prompt} . ornate, Jean-Honoré Fragonard style, pastel colors, opulence",
//     // "Digital Glitch Art {prompt} . malfunction aesthetics, Rosa Menkman-inspired, color dispersion",
//     // "Art Brut/Outsider Art {prompt} . raw, Henry Darger-inspired, intense expression",
//     // "Psychedelic Poster Design {prompt} . 1960s revival, Peter Max style, trippy visuals",
//     // "Ice and Snow Sculpture {prompt} . Simon Beck-inspired, winter festival, ephemeral designs",
//     // "Artisanal Jewelry Design {prompt} . handcrafted, René Lalique-inspired, intricate metalwork",
//     // "Sandstone Carving {prompt} . Petra, Jordan-inspired, ancient style, detailed relief work",
//     // "Hyperrealistic Miniature Painting {prompt} . Lorraine Loots style, small scale, lifelike",
//     // "Aerospace Concept Art {prompt} . futuristic, Chesley Bonestell-inspired spacecraft, interstellar travel",
//     // "Mandala Art {prompt} . Carl Jung-inspired, symmetrical patterns, spiritual symbolism",
//     // "Silhouette Animation {prompt} . Lotte Reiniger style, contrast, shadow play",
//     // "Historical Battle Scene Reenactment {prompt} . epic scale, Jacques-Louis David-inspired, intense action",
//     // "Shadow Box Art {prompt} . Joseph Cornell-inspired, layered paper, diorama style",
//     // "Street Mural in 3D {prompt} . Edgar Mueller-style, optical illusion, large-scale, urban art",
//     // "Art Therapy Collage {prompt} . Hannah Höch-inspired, mixed media, emotional expression, personal narratives",
//     // "Nail Art Design {prompt} . intricate, Yayoi Kusama polka dot patterns, miniature canvases",
//     // "Light Painting Photography {prompt} . long exposure, night photography",
//     // "Lace Making {prompt} . delicate, Alençon lace patterns, traditional craftsmanship, intricate",
//     // "Botanical Illustration {prompt} . Maria Sibylla Merian style, scientific accuracy, detailed plant life",
//     // "Encaustic (Wax) Painting {prompt} . Jasper Johns-inspired, ancient technique, layered wax, textural",
//     // "Paper Quilling Art {prompt} . Yulia Brodskaya style, rolled paper, 3D effects, intricate designs",
//     // "Neo-Expressionist Painting {prompt} . Jean-Michel Basquiat-inspired, bold colors, emotive, modern abstraction",
//     // "Impressionist landscape painting {prompt} . Claude Monet-inspired, quick brush strokes, vibrant light effects",
//     // "Cubist abstract composition {prompt} . Pablo Picasso style, geometric shapes, fragmented objects",
//     // "Candid urban photography {prompt} . Henri Cartier-Bresson style, spontaneous, black and white, human elements",
//     // "Modern public sculpture {prompt} . abstract forms, large-scale, outdoor setting",
//     // "Augmented reality art experience {prompt} . teamLab-inspired, immersive, blending real and virtual elements",
//     // "Contemporary performance art scene {prompt} . Marina Abramović style, dynamic, human expression",
//     // "Infrared landscape photography {prompt} . Richard Mosse-inspired, surreal colors, ethereal nature",
//     // "Land art installation {prompt} . Andy Goldsworthy style, natural materials, environmental theme",
//     // "Korean Minhwa painting {prompt} . folk art, vibrant, inspired by Shin Saimdang, traditional motifs",
//     // "Stop-motion animation scene {prompt} . frame-by-frame, whimsical storytelling",
//     // "Political caricature {prompt} . Honoré Daumier style, exaggerated features, satirical, editorial",
//     // "Eco-futuristic city design {prompt} . Sustainable architecture, green spaces, solarpunk",
//     // "Victorian fashion sketch {prompt} . Charles Frederick Worth-inspired, detailed period clothing, ornate accessories",
//     // "Artistic gourmet dish presentation {prompt} . Ferran Adrià-inspired, culinary art, vibrant, creative plating",
//     // "West African mask design {prompt} . inspired by Akan goldweights, bold patterns, cultural symbolism",
//     // "Surrealist dreamscape {prompt} . Salvador Dalí-inspired, subconscious imagery, bizarre landscapes",
//     // "Plein air city drawing {prompt} . Edward Hopper style, on-site sketching, watercolor and ink",
//     // "Abstract animation sequence {prompt} . Oskar Fischinger-inspired, non-linear storytelling, experimental visuals",
//     // "Revivalist building design {prompt} . Andrea Palladio-inspired, neoclassical elements, grandeur",
//     // "Stained glass window design {prompt} . Louis Comfort Tiffany style, vibrant colors, intricate patterns",
//     // "Ephemeral ice carving {prompt} . Simon Beck-inspired, transparent beauty, temporary art",
//     // "Expressive art therapy painting {prompt} . Wassily Kandinsky-inspired, emotional release, abstract expression",
//     // "Traditional puppet character {prompt} . Jim Henson-inspired, handcrafted, intricate costumes",
//     // "Fantasy makeup look {prompt} . Pat McGrath-inspired, creative face painting, theatrical effects",
//     // "Ancient Mural Reconstruction {prompt} . inspired by Pompeii frescoes, historic scenes, faded frescoes",
//     // "Rococo-Inspired Scene {prompt} . Jean-Honoré Fragonard style, ornate, gold leaf, pastel colors",
//     // "Digital Glitch Art {prompt} . Rosa Menkman-inspired, malfunction aesthetics, pixel shatter",
//     // "Art Brut/Outsider Art {prompt} . Henry Darger-inspired, raw, non-conformist, intense expression",
//     // "Kinetic Sand Art {prompt} . Tim Bengel-inspired, flowing patterns, sand textures, dynamic",
//     // "Psychedelic Poster Design {prompt} . Peter Max style, 1960s revival, trippy visuals, bright neon",
//     // "Ice and Snow Sculpture {prompt} . Simon Beck-inspired, winter festival, ephemeral frosty designs",
//     // "Artisanal Jewelry Design {prompt} . René Lalique-inspired, handcrafted jewelry, intricate metalwork",
//     // "Sandstone Carving {prompt} . inspired by Petra, Jordan, ancient style, detailed relief work",
//     // "Hyperrealistic Miniature Painting {prompt} . Lorraine Loots-inspired, small scale, detailed brushwork",
//     // "Aerospace Concept Art {prompt} . Chesley Bonestell-inspired, futuristic spacecraft, interstellar travel",
//     // "Mandala Art {prompt} . Carl Jung-inspired, symmetrical, intricate patterns, spiritual symbolism",
//     // "Silhouette Animation {prompt} . Lotte Reiniger style, contrast, shadow play, narrative storytelling",
//     // "Historical Battle Scene Reenactment {prompt} . Jacques-Louis David-inspired, epic scale, detailed costumes",
//     // "Shadow Box Art {prompt} . Joseph Cornell-inspired, layered paper, depth illusion, diorama style",
//     // "Street Mural in 3D {prompt} . Edgar Mueller style, optical illusion, large-scale, urban art",
//     // "Art Therapy Collage {prompt} . Hannah Höch-inspired, mixed media, emotional expression, personal narratives",
//     // "analog film photo {prompt} . faded film, desaturated, 35mm photo, grainy, vignette, vintage, Kodachrome, Lomography, found footage - Ansel Adams-inspired",
//     // "anime artwork {prompt} . anime style, key visual, vibrant, studio anime, highly detailed - Hayao Miyazaki-inspired",
//     // "cinematic {prompt} . shallow depth of field, vignette, highly detailed, high budget, bokeh, moody, epic, gorgeous, film grain, grainy - Roger Deakins-inspired",
//     // "comic {prompt} . graphic illustration, comic art, graphic novel art, vibrant, highly detailed - Jack Kirby-inspired",
//     // "play-doh style {prompt} . sculpture, clay art, centered composition, Claymation - Will Vinton-inspired",
//     // "breathtaking {prompt} . award-winning, professional, highly detailed - Annie Leibovitz-inspired",
//     // "isometric style {prompt} . vibrant, beautiful, crisp, detailed, ultra detailed, intricate - M. C. Escher-inspired",
//     // "line art drawing {prompt} . professional, sleek, modern, minimalist, graphic, line art, vector graphics - Aubrey Beardsley-inspired",
//     // "low-poly style {prompt} . low-poly game art, polygon mesh, jagged, blocky, wireframe edges, centered composition - Timothy J. Reynolds-inspired",
//     // "neonpunk style {prompt} . cyberpunk, vaporwave, neon, vibes, vibrant, stunningly beautiful, crisp, detailed, sleek, ultramodern - Syd Mead-inspired",
//     // "origami style {prompt} . paper art, pleated paper, folded, origami art, pleats, cut and fold, centered composition - Akira Yoshizawa-inspired",
//     // "glitch art portrait {prompt} . digital distortion, VHS overlay, retro cyber effects, pixelated errors - Rosa Menkman-inspired",
//     // "HDR urban photography {prompt} . high dynamic range, crisp details, vivid colors, cityscape focus - Trey Ratcliff-inspired",
//     // "psychedelic abstract {prompt} . vibrant swirls, optical illusions, bold colors, reminiscent of 1960s art - Peter Max-inspired",
//     // "8mm vintage travel film {prompt} . grainy texture, sepia tones, flickering effect, nostalgic feel - Jonas Mekas-inspired",
//     // "digital vector illustration {prompt} . clean lines, flat colors, Adobe Illustrator style, modern graphic - Shepard Fairey-inspired",
//     // "macro nature photography {prompt} . extreme close-up, detailed textures, bokeh background, vivid flora or fauna - Robert Mapplethorpe-inspired",
//     // "gothic fantasy {prompt} . dark and brooding atmosphere, medieval architecture, mythical creatures - Gustave Doré-inspired",
//     // "art deco poster {prompt} . geometric shapes, gold and metallic accents, elegant fonts, 1920s glamour - Cassandre-inspired",
//     // "holographic 3D model {prompt} . futuristic, shimmering rainbow effects, translucent, light-interactive - James Turrell-inspired",
//     // "experimental mixed media {prompt} . collage elements, diverse materials, avant-garde, textural contrasts - Robert Rauschenberg-inspired",
//     // "risograph art print {prompt} . layered colors, grainy texture, limited color palette, retro vibe - Andy Warhol-inspired",
//     // "minimalist Scandinavian design {prompt} . clean lines, muted colors, functional and modern, natural elements - Alvar Aalto-inspired",
//     // "Japanese ink wash painting {prompt} . sumi-e style, brush strokes, monochrome, Zen-like simplicity - Sesshū Tōyō-inspired",
//     // "graffiti street art {prompt} . bold colors, urban style, spray paint textures, street culture - Banksy-inspired",
//     // "noir film scene {prompt} . black and white, high contrast, shadowy, 1940s detective film vibe - John Alton-inspired",
//     // "virtual reality landscape {prompt} . futuristic, immersive, 360-degree view, digital world - Ernest Cline-inspired",
//     // "bioluminescent underwater scene {prompt} . glowing creatures, deep sea, mysterious, vibrant colors - James Cameron-inspired",
//     // "medieval manuscript illustration {prompt} . illuminated letters, gold leaf, intricate borders, historical - The Limbourg Brothers-inspired",
//     // "surreal cosmic landscape {prompt} . otherworldly, starry skies, floating elements, dreamy colors - René Magritte-inspired",
//     // "claymation character design {prompt} . stop-motion style, textured, whimsical, playful - Nick Park-inspired",
//     // "woodblock print nature scene {prompt} . traditional Japanese style, layered, natural patterns - Hokusai-inspired",
//     // "interactive 3D game environment {prompt} . immersive, realistic textures, dynamic lighting, engaging - Shigeru Miyamoto-inspired",
//     // "pop art advertisement {prompt} . bold colors, comic style, 1960s vibe, catchy tagline - Roy Lichtenstein-inspired",
//     // "ambient mood scene {prompt} . soft lighting, calming colors, tranquil, soothing atmosphere - Claude Monet-inspired",
//     // "steampunk gadget design {prompt} . mechanical parts, bronze and copper, Victorian era, intricate gears - Jules Verne-inspired",
//     // "Cyberpunk city at night {prompt} . neon lights, futuristic buildings, dystopian, rain-soaked streets - Ridley Scott-inspired",
//     // "Impressionist landscape painting {prompt} . quick brush strokes, light effects, vibrant - Claude Monet-inspired",
//     // "Cubist abstract composition {prompt} . geometric shapes, fragmented objects - Pablo Picasso-inspired",
//     // "Aboriginal dot painting {prompt} . indigenous Australian art, dot pattern, earthy colors, symbolic - Albert Namatjira-inspired",
//     // "Candid urban photography {prompt} . spontaneous, street life, black and white, human elements - Henri Cartier-Bresson-inspired",
//     // "Augmented reality art experience {prompt} . immersive, interactive, blending real and virtual elements - Olafur Eliasson-inspired",
//     // "Contemporary performance art scene {prompt} . dynamic, conceptual, human expression, avant-garde - Marina Abramović-inspired",
//     // "Infrared landscape photography {prompt} . surreal colors, otherworldly, ethereal, nature-focused - Richard Mosse-inspired",
//     // "Land art installation {prompt} . natural materials, outdoor setting, earthworks, environmental theme - Robert Smithson-inspired",
//     // "Korean Minhwa painting {prompt} . folk art, vibrant colors, mythical creatures, traditional motifs - Shin Saimdang-inspired",
//     // // "Stop-motion animation scene {prompt} . frame-by-frame, detailed, whimsical, story-driven - Ray Harryhausen-inspired",
//     // "Political caricature {prompt} . exaggerated features, humorous, critical, editorial style - Honoré Daumier-inspired",
//     // "Eco-futuristic city design {prompt} . green architecture, sustainable living spaces, integration with nature",
//     // "Victorian fashion sketch {prompt} . detailed period clothing, elegant postures, ornate accessories - Charles Frederick Worth-inspired",
//     // "Artistic gourmet dish presentation {prompt} . culinary art, creative plating, vibrant colors - Ferran Adrià-inspired",
//     // "West African mask design {prompt} . bold patterns, ritual significance, cultural symbolism - Akan goldweights-inspired",
//     // "Surrealist dreamscape {prompt} . subconscious imagery, bizarre landscapes - Salvador Dali-inspired",
//     // "Plein air city drawing {prompt} . on-site sketching, watercolor and ink - Edward Hopper-inspired",
//     // "Abstract animation sequence {prompt} . non-linear storytelling, experimental visuals - Norman McLaren-inspired",
//     // "Revivalist building design {prompt} . classical elements, symmetry, grandeur - Andrea Palladio-inspired",
//     // "Stained glass window design {prompt} . vibrant colors, intricate patterns - Louis Comfort Tiffany-inspired",
//     // "Art Deco Futurism {prompt} . geometric shapes, sleek lines, futuristic motifs, reminiscent of early 20th-century sci-fi",
//     // "Steampunk {prompt} . Victorian-era aesthetics, steam-powered machinery, industrial revolution fantasy, brass and copper details",
//     // "Dieselpunk {prompt} . interwar period inspired, retro cars and aircraft, Art Deco architecture, noir film influence",
//     // "Atompunk {prompt} . Atomic Age design, mid-century modern, space age and nuclear motifs, early computer technology aesthetics",
//     // "Raygun Gothic {prompt} . golden-age American sci-fi visuals, sleek, streamlined designs, chrome, glass, neon",
//     // "Cyberprep {prompt} . utopian future, vibrant colors, advanced clean technology, retro-futuristic urban landscapes",
//     // "Sovietwave {prompt} . Soviet-era imagery, futuristic concepts, Brutalist architecture, space race-era technology",
// ];

const templatesAndPrompts = [
    {
        template:
            "professional 3d model {prompt} . octane render, highly detailed, volumetric, dramatic lighting",
        prompts: [
            "car",
            "person",
            "animal",
            "building",
            "natural landscape",
            "surreal dreamscape",
            "fourth dimension architecture",
        ],
    },
    {
        template:
            "analog film photo {prompt} . faded film, desaturated, 35mm photo, grainy, vignette, vintage, Kodachrome, Lomography, found footage",
        prompts: [
            "city street",
            "beach",
            "mountain landscape",
            "old barn",
            "abandoned place",
            "concept of time",
            "exploration of loneliness",
        ],
    },
    {
        template:
            "anime artwork {prompt} . anime style, key visual, vibrant, studio anime, highly detailed",
        prompts: [
            "main character",
            "fantasy creature",
            "futuristic vehicle",
            "natural landscape",
            "cityscape",
            "inner psyche",
            "alternate reality",
        ],
    },
    {
        template:
            "professional 3d model {prompt} . octane render, highly detailed, volumetric, dramatic lighting",
        prompts: [
            "car",
            "person",
            "animal",
            "building",
            "natural landscape",
            "surreal dreamscape",
            "fourth dimension architecture",
        ],
    },
    {
        template:
            "analog film photo {prompt} . faded film, desaturated, 35mm photo, grainy, vignette, vintage, Kodachrome, Lomography, found footage",
        prompts: [
            "city street",
            "beach",
            "mountain landscape",
            "old barn",
            "abandoned place",
            "concept of time",
            "exploration of loneliness",
        ],
    },
    {
        template:
            "anime artwork {prompt} . anime style, key visual, vibrant, studio anime, highly detailed",
        prompts: [
            "main character",
            "fantasy creature",
            "futuristic vehicle",
            "natural landscape",
            "cityscape",
            "inner psyche",
            "alternate reality",
        ],
    },
    {
        template:
            "{prompt} . shallow depth of field, vignette, highly detailed, high budget, bokeh, moody, epic, gorgeous, film grain, grainy",
        prompts: [
            "person portrait",
            "still life",
            "landscape",
            "architectural",
            "automotive",
            "dreamlike abstraction",
            "surreal alternate dimension",
        ],
    },
    {
        template:
            "comic {prompt} . graphic illustration, comic art, graphic novel art, vibrant, highly detailed",
        prompts: [
            "superhero",
            "fantasy character",
            "sci-fi scene",
            "everyday scene",
            "action sequence",
            "epic metaphor",
            "visualized philosophy",
        ],
    },
    {
        template:
            "play-doh style {prompt} . sculpture, clay art, centered composition, Claymation",
        prompts: [
            "animal",
            "person",
            "vehicle",
            "building",
            "food",
            "shape of a memory",
            "anthropomorphic emotion",
        ],
    },
    {
        template:
            "breathtaking {prompt} . award-winning, professional, highly detailed",
        prompts: [
            "landscape photo",
            "cityscape",
            "character portrait",
            "still life",
            "architectural interior",
            "beauty of knowledge",
            "wonder of the universe",
        ],
    },
    {
        template:
            "ethereal fantasy concept art of {prompt} . magnificent, celestial, ethereal, painterly, epic, majestic, magical, fantasy art, cover art, dreamy",
        prompts: [
            "mystical creature",
            "natural landscape",
            "castle",
            "wizard tower",
            "futuristic city",
            "stream of consciousness",
            "evolution of humanity",
        ],
    },
    {
        template:
            "isometric style {prompt} . vibrant, beautiful, crisp, detailed, ultra detailed, intricate",
        prompts: [
            "cityscape",
            "room interior",
            "fantasy landscape",
            "sci-fi scene",
            "everyday scene",
            "complex philosophy",
            "synaptic connections",
        ],
    },
    {
        template:
            "line art drawing {prompt} . professional, sleek, modern, minimalist, graphic, line art, vector graphics",
        prompts: [
            "animal",
            "person",
            "still life",
            "landscape",
            "architectural",
            "visual metaphor",
            "emotional topology",
        ],
    },
    {
        template:
            "low-poly style {prompt} . low-poly game art, polygon mesh, jagged, blocky, wireframe edges, centered composition",
        prompts: [
            "animal",
            "vehicle",
            "building",
            "landscape",
            "object",
            "fragmented reality",
            "digital consciousness",
        ],
    },
    {
        template:
            "neonpunk style {prompt} . cyberpunk, vaporwave, neon, vibes, vibrant, stunningly beautiful, crisp, detailed, sleek, ultramodern",
        prompts: [
            "cityscape",
            "character",
            "vehicle",
            "room interior",
            "abstract landscape",
            "technological singularity",
            "transhuman ideation",
        ],
    },
    {
        template:
            "origami style {prompt} . paper art, pleated paper, folded, origami art, pleats, cut and fold, centered composition",
        prompts: [
            "animal",
            "plant",
            "object",
            "building",
            "person",
            "unfolding awareness",
            "recursive patterns",
        ],
    },
    {
        template:
            "cinematic still {prompt} . emotional, harmonious, vignette, highly detailed, high budget, bokeh, cinemascope, moody, gorgeous, film grain, grainy",
        prompts: [
            "portrait",
            "landscape",
            "cityscape",
            "still life",
            "intimate scene",
            "spiritual awakening",
            "samsara illusion",
        ],
    },
    {
        template:
            "cinematic photo {prompt} . 35mm photograph, film, bokeh, professional, 4k, highly detailed",
        prompts: [
            "landscape",
            "street scene",
            "architectural",
            "automotive",
            "still life",
            " rollercoaster of life",
            "lacrimation of time",
        ],
    },
    {
        template:
            "anime artwork {prompt} . anime style, key visual, vibrant, studio anime, highly detailed",
        prompts: [
            "main character",
            "fantasy creature",
            "futuristic vehicle",
            "natural landscape",
            "cityscape",
            "battle of good vs evil",
            "hero's journey within",
        ],
    },
    {
        template:
            "manga style {prompt} . vibrant, high-energy, detailed, iconic, Japanese comic style",
        prompts: [
            "action scene",
            "emotional moment",
            "fantasy landscape",
            "sci-fi technology",
            "school setting",
            "alternate timeline",
            "dream within a dream",
        ],
    },
    {
        template:
            "concept art {prompt} . digital artwork, illustrative, painterly, matte painting, highly detailed",
        prompts: [
            "futuristic city",
            "alien world",
            "medieval building",
            "mystical landscape",
            "vehicle design",
            "sentient machine life",
            "multiverse theory",
        ],
    },
    {
        template:
            "pixel-art {prompt} . low-res, blocky, pixel art style, 8-bit graphics",
        prompts: [
            "character",
            "creature",
            "landscape",
            "spaceship",
            "everyday scene",
            "platonic forms",
            "holographic simulation",
        ],
    },

    {
        template:
            "glitch art portrait {prompt} . digital distortion, VHS overlay, retro cyber effects, pixelated errors",
        prompts: [
            "man",
            "woman",
            "nonbinary person",
            "fantasy character",
            "sci-fi cyborg",
            "fragmented identity",
            "decay of memory",
        ],
    },
    {
        template:
            "HDR urban photography {prompt} . high dynamic range, crisp details, vivid colors, cityscape focus",
        prompts: [
            "street scene",
            "downtown",
            "bridge",
            "plaza",
            "park",
            "the urban hive mind",
            "peaks and valleys of capitalism",
        ],
    },
    {
        template:
            "charcoal sketch {prompt} . rough textures, gradations of black and white, smudged shading, realistic",
        prompts: [
            "person",
            "still life",
            "animal",
            "landscape",
            "architectural",
            "negative space as subject",
            "varieties of void",
        ],
    },
    {
        template:
            "psychedelic abstract {prompt} . vibrant swirls, optical illusions, bold colors, reminiscent of 1960s art",
        prompts: [
            "swirling vortex",
            "cosmic waves",
            "sacred geometry",
            "kaleidoscopic pattern",
            "visionary portal",
            "tunnel to the collective unconscious",
            "archetypal forms and flows",
        ],
    },
    {
        template:
            "8mm vintage travel film {prompt} . grainy texture, sepia tones, flickering effect, nostalgic feel",
        prompts: [
            "bustling market",
            "quiet village",
            "winding road",
            "misty harbor",
            "verdant valley",
            "wanderlust and epiphany",
            "impermanence and decay",
        ],
    },
    {
        template:
            "digital vector illustration {prompt} . clean lines, flat colors, Adobe Illustrator style, modern graphic",
        prompts: [
            "animal",
            "person",
            "still life",
            "landscape",
            "architectural",
            "symbolic iconography",
            "maximalist reductionism",
        ],
    },
    {
        template:
            "macro nature photography {prompt} . extreme close-up, detailed textures, bokeh background, vivid flora or fauna",
        prompts: [
            "insect",
            "flower",
            "leaf",
            "fungus",
            "raindrops",
            "the universe in a dewdrop",
            "fractals within fractals",
        ],
    },
    {
        template:
            "gothic fantasy {prompt} . dark and brooding atmosphere, medieval architecture, mythical creatures",
        prompts: [
            "ominous castle",
            "forbidden forest",
            "witches coven",
            "vampire lair",
            "ghostly apparition",
            "plague of abstraction",
            "allegorical psychomachia",
        ],
    },
    {
        template:
            "holographic 3D model {prompt} . futuristic, shimmering rainbow effects, translucent, light-interactive",
        prompts: [
            "vehicle",
            "building",
            "creature",
            "object",
            "avatar",
            "simulacrum of consciousness",
            "holographic neural mapping",
        ],
    },
    {
        template:
            "experimental mixed media {prompt} . collage elements, diverse materials, avant-garde, textural contrasts",
        prompts: [
            "surreal portrait",
            "dreamlike landscape",
            "abstract still life",
            "psychedelic patterns",
            "figurative sculpture",
            "chaos into order",
            "the collective unconscious",
        ],
    },

    // Previous templates omitted

    {
        template:
            "risograph art print {prompt} . layered colors, grainy texture, limited color palette, retro vibe",
        prompts: [
            "botanical illustration",
            "cityscape",
            "character portrait",
            "abstract geometric",
            "nature landscape",
            "multiverse fragments",
            "symbolic archetypes",
        ],
    },
    {
        template:
            "minimalist Scandinavian design {prompt} . clean lines, muted colors, functional and modern, natural elements",
        prompts: [
            "furniture",
            "clothing",
            "houseware",
            "textiles",
            "lighting",
            "reductive essentialism",
            "negative space equilibrium",
        ],
    },
    {
        template:
            "Japanese ink wash painting {prompt} . sumi-e style, brush strokes, monochrome, Zen-like simplicity",
        prompts: [
            "landscape",
            "animal",
            "flower",
            "bamboo",
            "seasons",
            "tranquil impermanence",
            "wabi-sabi aesthetics",
        ],
    },
    {
        template:
            "graffiti street art {prompt} . bold colors, urban style, spray paint textures, street culture",
        prompts: [
            "character",
            "typography",
            "abstract shapes",
            "pop culture",
            "social commentary",
            "semiotic disobedience",
            "hegemonic intervention",
        ],
    },
    {
        template:
            "noir film scene {prompt} . black and white, high contrast, shadowy, 1940s detective film vibe",
        prompts: [
            "back alley",
            "smoky office",
            "pool hall",
            "train station",
            "nightclub",
            "jungian shadow",
            "moral ambiguity",
        ],
    },
    {
        template:
            "virtual reality landscape {prompt} . futuristic, immersive, 360-degree view, digital world",
        prompts: [
            "alien planet",
            "cyberspace",
            "mystical realm",
            "synthetic nature",
            "simulated city",
            "the sublime terrarium",
            "cartesian perspectivalism",
        ],
    },
    {
        template:
            "bioluminescent underwater scene {prompt} . glowing creatures, deep sea, mysterious, vibrant colors",
        prompts: [
            "jellyfish",
            "seabed",
            "coral reef",
            "giant squid",
            "sunken ship",
            "the collective bioluminescent consciousness",
            "deep sea surrealism",
        ],
    },
    {
        template:
            "medieval manuscript illustration {prompt} . illuminated letters, gold leaf, intricate borders, historical",
        prompts: [
            "fantasy story",
            "nature scene",
            "castle siege",
            "royal court",
            "religious event",
            "alchemical allegories",
            "esoteric symbolism",
        ],
    },
    {
        template:
            "surreal cosmic landscape {prompt} . otherworldly, starry skies, floating elements, dreamy colors",
        prompts: [
            "alien world",
            "mystical realm",
            "heavenly clouds",
            "sacred geometry",
            "magic portal",
            "dark surrealist astrology",
            "Jungian dreamscape",
        ],
    },
    {
        template:
            "claymation character design {prompt} . stop-motion style, textured, whimsical, playful",
        prompts: [
            "human",
            "animal",
            "fantasy creature",
            "robot",
            "monster",
            "uncanny embodiment",
            "dreamlike archetypes",
        ],
    },
    {
        template:
            "woodblock print nature scene {prompt} . traditional Japanese style, layered, natural patterns",
        prompts: [
            "mountains",
            "forest",
            "garden",
            "river",
            "ocean",
            "seasonal impermanence ",
            "landscape as mindscape",
        ],
    },
    {
        template:
            "interactive 3D game environment {prompt} . immersive, realistic textures, dynamic lighting, engaging",
        prompts: [
            "fantasy world",
            "sci-fi city",
            "natural landscape",
            "ancient ruins",
            "alien planet",
        ],
    },
    {
        template:
            "pop art advertisement {prompt} . bold colors, comic style, 1960s vibe, catchy tagline",
        prompts: ["soda", "fast food", "appliance", "fashion", "electronics"],
    },
    {
        template:
            "ambient mood scene {prompt} . soft lighting, calming colors, tranquil, soothing atmosphere",
        prompts: [
            "candlelit room",
            "rainy window",
            "sunset sky",
            "forest glen",
            "quiet cafe",
        ],
    },
    {
        template:
            "steampunk gadget design {prompt} . mechanical parts, bronze and copper, Victorian era, intricate gears",
        prompts: [
            "time machine",
            "robot",
            "vehicle",
            "weapon",
            "analytical device",
        ],
    },
    {
        template:
            "Cyberpunk city at night {prompt} . neon lights, futuristic buildings, dystopian, rain-soaked streets",
        prompts: [
            "downtown",
            "plaza",
            "alleyway",
            "apartment block",
            "cabaret bar",
        ],
    },
    {
        template:
            "Impressionist landscape painting {prompt} . quick brush strokes, light effects, vibrant, Monet-inspired",
        prompts: [
            "garden",
            "riverbank",
            "poppy field",
            "lily pond",
            "forest scene",
        ],
    },
    {
        template:
            "Cubist abstract composition {prompt} . geometric shapes, fragmented objects, Picasso-esque style",
        prompts: [
            "portrait",
            "still life",
            "cityscape",
            "orchestral scene",
            "dancer",
        ],
    },
    {
        template:
            "Candid urban photography {prompt} . spontaneous, street life, black and white, human elements",
        prompts: [
            "market scene",
            "café patrons",
            "park bench",
            "subway station",
            "street performers",
        ],
    },
    {
        template:
            "Augmented reality art experience {prompt} . immersive, interactive, blending real and virtual elements",
        prompts: [
            "abstract shapes",
            "fantasy forest",
            "spatial installation",
            "simulated ruins",
            "light sculptures",
        ],
    },
    {
        template:
            "Contemporary performance art scene {prompt} . dynamic, conceptual, human expression, avant-garde",
        prompts: [
            "movement study",
            "interpretive dance",
            "theatrical tableau",
            "spoken word poetry",
            "body painting",
        ],
    },
    {
        template:
            "Infrared landscape photography {prompt} . surreal colors, otherworldly, ethereal, nature-focused",
        prompts: ["forest", "desert", "waterfront", "canyon", "mountain vista"],
    },
    {
        template:
            "Land art installation {prompt} . natural materials, outdoor setting, earthworks, environmental theme",
        prompts: [
            "field of wheat",
            "stone pathway",
            "spiraling rocks",
            "driftwood structure",
            "earthen mounds",
        ],
    },
    {
        template:
            "Korean Minhwa painting {prompt} . folk art, vibrant colors, mythical creatures, traditional motifs",
        prompts: [
            "tiger",
            "dragon",
            "phoenix",
            "noble scholar",
            "mountain spirit",
        ],
    },
    {
        template:
            "Stop-motion animation scene {prompt} . frame-by-frame, detailed, whimsical, story-driven",
        prompts: [
            "clay forest",
            "paper ocean",
            "fabric meadow",
            "woodland characters",
            "city of toys",
        ],
    },
    {
        template:
            "Political caricature {prompt} . exaggerated features, humorous, critical, editorial style",
        prompts: [
            "world leader",
            "corporate executive",
            "limelight politician",
            "financial elite",
            "media tycoon",
        ],
    },
    {
        template:
            "Eco-futuristic city design {prompt} . green architecture, sustainable living spaces, integration with nature",
        prompts: [
            "residential complex",
            "office towers",
            "urban farm",
            "solar structures",
            "green skyline",
        ],
    },
    {
        template:
            "Victorian fashion sketch {prompt} . detailed period clothing, elegant postures, ornate accessories",
        prompts: [
            "noblewoman",
            "debutante",
            "opera patron",
            "military officer",
            "servant girl",
        ],
    },
    {
        template:
            "Artistic gourmet dish presentation {prompt} . culinary art, creative plating, vibrant colors, gastronomy focus",
        prompts: [
            "salad",
            "quiche",
            "seafood platter",
            "berry tart",
            "charcuterie board",
        ],
    },
    {
        template:
            "West African mask design {prompt} . bold patterns, ritual significance, cultural symbolism",
        prompts: [
            "spirit guide",
            "royal visage",
            "character archetype",
            "symbolic animal",
            "ceremonial disguise",
        ],
    },
    {
        template:
            "Surrealist dreamscape {prompt} . subconscious imagery, Freudian symbols, bizarre landscapes",
        prompts: [
            "melting clocks",
            "floating stairs",
            "eyeballs and clouds",
            "giant insects",
            "levitating objects",
        ],
    },
    {
        template:
            "Plein air city drawing {prompt} . on-site sketching, lively street scenes, watercolor and ink",
        prompts: [
            "busy intersection",
            "public market",
            "riverside walk",
            "construction site ",
            "subway platform",
        ],
    },
    {
        template:
            "Abstract animation sequence {prompt} . non-linear storytelling, experimental visuals, mixed media",
        prompts: [
            "rippling patterns",
            "cosmic waves",
            "morphing geometry",
            "surreal metamorphosis",
            "psychedelic visions",
        ],
    },
    {
        template:
            "Revivalist building design {prompt} . classical elements, symmetry, grandeur, inspired by Ancient Greece and Rome",
        prompts: [
            "government institution",
            "museum facade",
            "university library",
            "grand hotel lobby",
            "stock exchange interior",
        ],
    },
    {
        template:
            "Stained glass window design {prompt} . vibrant colors, light effects, intricate patterns",
        prompts: [
            "natural landscape",
            "religious scene",
            "fantasy story",
            "geometric pattern",
            "art nouveau style",
        ],
    },
    {
        template:
            "Expressive art therapy painting {prompt} . emotional release, abstract expression, therapeutic process",
        prompts: [
            "anger issues",
            "grief process",
            "self-discovery",
            "stress relief",
            "healing trauma",
        ],
    },
    {
        template:
            "Traditional puppet character {prompt} . handcrafted, intricate costumes, storytelling tools",
        prompts: [
            "folklore hero",
            "trickster fox",
            "wizard mentor",
            "animal companion",
            "comedic sidekick",
        ],
    },
    {
        template:
            "Fantasy makeup look {prompt} . creative face painting, theatrical effects, character transformation",
        prompts: [
            "forest nymph",
            "techno android",
            "demonic entity",
            "mythical siren",
            "cyberpunk hacker",
        ],
    },
    {
        template:
            "Ancient Mural Reconstruction {prompt} . historic scenes, faded frescoes, archaeological style",
        prompts: [
            "daily life vignettes",
            "royal procession",
            "ritual ceremony",
            "battle epic",
            "afterlife myth",
        ],
    },
    {
        template:
            "Rococo-Inspired Scene {prompt} . ornate, gold leaf, pastel colors, opulent, 18th-century elegance",
        prompts: [
            "aristocratic portrait",
            "palace ballroom",
            "lush royal garden",
            "theatrical performance",
            "mythological painting",
        ],
    },
    {
        template:
            "Digital Glitch Art {prompt} . malfunction aesthetics, pixel shatter, color dispersion, modern digital",
        prompts: [
            "fractured self-portrait",
            "corrupted cityscape",
            "disintegrating dancer",
            "chromatic serenity errors",
            "condensed quantum foam",
        ],
    },
    {
        template:
            "Art Brut/Outsider Art {prompt} . raw, non-conformist, intense expression, untrained artist style",
        prompts: [
            "visionary symbols",
            "extreme emotions",
            "psychological archetypes",
            "social commentary",
            "personal metaphor",
        ],
    },
    {
        template:
            "Psychedelic Poster Design {prompt} . 1960s revival, trippy visuals, bright neon, Hendrix-era vibe",
        prompts: [
            "music festival",
            "counterculture film",
            "mind-bending book cover",
            "spiritual happening",
            "fantasy gig poster",
        ],
    },
    {
        template:
            "Artisanal Jewelry Design {prompt} . handcrafted jewelry, intricate metalwork, gemstone details, luxury craftsmanship",
        prompts: [
            "gemstone pendant",
            "art deco ring",
            "nature-inspired bracelet",
            "pearl drop earrings",
            "labyrinth locket",
        ],
    },
    {
        template:
            "Sandstone Carving {prompt} . ancient style, detailed relief work, weathered stone texture",
        prompts: [
            "epic battle scene",
            "sacred symbols",
            "royal history",
            "spiritual deities",
            "intricate geometric motifs",
        ],
    },
    {
        template:
            "Hyperrealistic Miniature Painting {prompt} . small scale, detailed brushwork, lifelike miniatures",
        prompts: [
            "berries and blossoms",
            "seashells and sand",
            "watch parts",
            "cocktail garnishes",
            "dessert buffet",
        ],
    },
    {
        template:
            "Aerospace Concept Art {prompt} . futuristic spacecraft, interstellar travel, high-tech, NASA-inspired",
        prompts: [
            "Mars exploration",
            "asteroid mining vessel",
            "deep space station",
            "laser-powered shuttle",
            "cryogenic hibernation craft",
        ],
    },
    {
        template:
            "Mandala Art {prompt} . symmetrical, intricate patterns, spiritual symbolism, colorful",
        prompts: [
            "chakra energies",
            "healing themes",
            "natural elements",
            "cosmic symbols",
            "culture and tradition",
        ],
    },
    {
        template:
            "Silhouette Animation {prompt} . contrast, shadow play, narrative storytelling, Lotte Reiniger style",
        prompts: [
            "folk tale",
            "fable",
            "gothic tale",
            "romantic vignette",
            "magical adventure",
        ],
    },
    {
        template:
            "Shadow Box Art {prompt} . layered paper, depth illusion, diorama style, intricate cutouts",
        prompts: [
            "storybook scene ",
            "memory capsule",
            "mythical landscape",
            "secret garden",
            "dreamy cityscape",
        ],
    },
    {
        template:
            "Street Mural in 3D {prompt} . optical illusion, large-scale, urban art, interactive pavement",
        prompts: [
            "deep sea diving ",
            "alternate universe",
            "surreal funhouse",
            "magical library labyrinth",
            "giant robot battle arena",
        ],
    },
    {
        template:
            "Art Therapy Collage {prompt} . mixed media, emotional expression, personal narratives, therapeutic process",
        prompts: [
            "loneliness and connection",
            "inner critic work",
            "overcoming trauma",
            "processing loss",
            "finding hope",
        ],
    },
    {
        template:
            "Lace Making {prompt} . delicate patterns, textile art, traditional craftsmanship, intricate",
        prompts: [
            "floral motifs",
            "geometric designs",
            "ornate heirloom",
            "sheer butterfly wings",
            "spiderweb filigree",
        ],
    },
    {
        template:
            "Botanical Illustration {prompt} . scientific accuracy, detailed plant life, naturalist style",
        prompts: [
            "rare orchids",
            "medicinal herbs",
            "carnivorous species",
            "rainforest varieties",
            "desert succulents",
        ],
    },
    {
        template:
            "Encaustic (Wax) Painting {prompt} . ancient technique, layered wax, textural, vibrant",
        prompts: [
            "abstract expression",
            "conceptual portrait",
            "dreamlike landscape",
            "symbolism and archetypes",
            "vibrant minimalism",
        ],
    },
    {
        template:
            "Paper Quilling Art {prompt} . rolled paper, 3D effects, intricate designs, decorative",
        prompts: [
            "synaptic mind map",
            "flower bouquet",
            "animal portrait",
            "topographical landscape ",
            "mathematical patterns",
        ],
    },
    {
        template:
            "Neo-Expressionist Painting {prompt} . bold colors, emotive, modern abstraction, Basquiat-inspired",
        prompts: [
            "urban commentary",
            "raw self-portrait",
            "primal symbolism",
            "jazz musicians",
            "psychological exploration",
        ],
    },

    {
        template:
            "Technical Illustration: Machinery {prompt} . Precision engineering, detailed components, industrial aesthetic",
        prompts: [
            "Cross-section of a jet engine",
            "Intricacies of a gearbox mechanism",
            "Complex hydraulic system diagram",
            "Articulation of a robotic arm",
            "Structural details of a suspension bridge",
        ],
    },
    {
        template:
            "Microscopic Imagery {prompt} . Cellular beauty, scientific accuracy, vibrant colors",
        prompts: [
            "Interconnected neuron network",
            "Detailed structure of a virus",
            "Flow of blood cells under a microscope",
            "Anatomy of a plant cell",
            "Diverse microbial ecosystem",
        ],
    },
    {
        template:
            "Technical Diagram: Electronics {prompt} . Schematic precision, functional design, modern technology",
        prompts: [
            "Detailed layout of a motherboard",
            "Circuitry of a wireless communication system",
            "Complex sensor network diagram",
            "Solar panel system configuration",
            "Inner workings of a smartphone",
        ],
    },
    {
        template:
            "3D Rendering: Architectural {prompt} . Structural elegance, architectural marvels, photorealistic detail",
        prompts: [
            "Framework of a modern skyscraper",
            "Cross-sectional view of a stadium",
            "Layout of a residential complex",
            "Design of a futuristic airport terminal",
            "Reconstruction of a historical monument",
        ],
    },
    {
        template:
            "Particle Systems Visualization {prompt} . Dynamic simulations, fluid movements, abstract forms",
        prompts: [
            "Airflow dynamics in a wind tunnel",
            "Simulation of water current patterns",
            "Visualization of magnetic field lines",
            "Particle collisions in an accelerator",
            "Modeling of gravity waves",
        ],
    },
    {
        template:
            "Point Cloud Imaging {prompt} . Spatial complexity, 3D data representation, topographical accuracy",
        prompts: [
            "3D model of an urban cityscape",
            "Topographical mapping of mountain ranges",
            "Forest ecosystem spatial analysis",
            "Detailed vehicle 3D scan",
            "Digital reconstruction of a historical site",
        ],
    },
    {
        template:
            "Exploded View Illustration {prompt} . Deconstructed complexity, mechanical insights, clear visualization",
        prompts: [
            "Disassembled watch mechanism",
            "Components of a drone",
            "Gears system of a bicycle",
            "Computer hardware breakdown",
            "Exploded view of engine parts",
        ],
    },
    {
        template:
            "Blueprint Design: Vehicle {prompt} . Engineering precision, technical layouts, innovative designs",
        prompts: [
            "Detailed sports car layout",
            "Structural blueprint of an aircraft",
            "Sailing yacht design schematics",
            "Space shuttle technical blueprint",
            "Blueprint of a high-speed train",
        ],
    },
    {
        template:
            "Anatomical Study: Human Body {prompt} . Biological intricacy, lifelike representations, medical precision",
        prompts: [
            "Detailed muscular system",
            "Skeletal structure illustration",
            "Comprehensive nervous system mapping",
            "Cardiovascular system diagram",
            "Respiratory system in detail",
        ],
    },
    {
        template:
            "Astronomical Chart {prompt} . Celestial wonders, cosmic exploration, stellar beauty",
        prompts: [
            "Orbital paths in the solar system",
            "Map of the night sky constellations",
            "Galactic structure and components",
            "Diagram of a celestial event",
            "Discovery of new exoplanets",
        ],
    },
    {
        template:
            "Renaissance Engineering Sketches {prompt} . Historical ingenuity, classical design, Da Vinci-inspired",
        prompts: [
            "Concept of a Da Vinci-inspired flying machine",
            "Sketch of a medieval siege engine",
            "Design of an early mechanical clock",
            "Blueprint of a historical ship",
            "Innovative bridge design from the Renaissance era",
        ],
    },
    {
        template:
            "Fantasy Cartography {prompt} . Imaginary worlds, adventurous routes, mythical landmarks",
        prompts: [
            "Map of a hidden treasure island",
            "Landscape of a fairy-tale kingdom",
            "Route through a dragon's territory",
            "Diagram of a magical underwater city",
            "Layout of a mystical forest",
        ],
    },
    {
        template:
            "Steampunk Inventions {prompt} . Retro-futuristic machinery, Victorian-era aesthetics, imaginative designs",
        prompts: [
            "Blueprint of a steampunk airship",
            "Design of a clockwork robot",
            "Sketch of a steam-powered vehicle",
            "Concept for a mechanical city",
            "Illustration of a gadget-filled laboratory",
        ],
    },
    {
        template:
            "Retro Sci-Fi Illustrations {prompt} . Vintage space age, atomic era designs, nostalgic futurism",
        prompts: [
            "Poster of a 1950s space colony",
            "Artwork of an alien encounter",
            "Design of a retro rocket ship",
            "Scene from a classic sci-fi movie",
            "Futuristic cityscape in a retro style",
        ],
    },
    {
        template:
            "Dystopian Cityscapes {prompt} . Post-apocalyptic environments, urban decay, surreal atmospheres",
        prompts: [
            "Ruins of a future metropolis",
            "Abandoned urban jungle",
            "Skylines of a fallen civilization",
            "Survivors in a dystopian landscape",
            "Overgrown city reclaimed by nature",
        ],
    },
    {
        template:
            "Surreal Dreamscapes {prompt} . Dreamlike visuals, abstract forms, ethereal themes",
        prompts: [
            "Landscape from a lucid dream",
            "Otherworldly natural phenomenon",
            "Surreal combination of elements",
            "Imaginary realm of consciousness",
            "Abstract interpretation of a dream",
        ],
    },
    {
        template:
            "Bio-Mechanical Concepts {prompt} . Fusion of organic and mechanical, futuristic symbiosis, intricate details",
        prompts: [
            "Cyborg wildlife illustration",
            "Mechanized plant structures",
            "Hybrid organism design",
            "Alien machinery infused with life",
            "Robotic and organic ecosystem",
        ],
    },
    {
        template:
            "Art Deco Revival {prompt} . Modern twist on classic style, geometric elegance, luxurious patterns",
        prompts: [
            "Contemporary building in Art Deco style",
            "Futuristic vehicle with Art Deco elements",
            "Art Deco inspired fashion design",
            "Modern interpretation of a classic Art Deco poster",
            "Interior design blending modernity and Art Deco",
        ],
    },
    {
        template:
            "Whimsical Food Art {prompt} . Playful food arrangements, imaginative culinary creations, colorful compositions",
        prompts: [
            "Landscape made of various fruits",
            "Portraits using assorted vegetables",
            "Cityscape crafted from baked goods",
            "Underwater scene with seafood elements",
            "Garden scene using sweets and pastries",
        ],
    },
    {
        template:
            "Optical Illusion Art {prompt} . Mind-bending designs, visual tricks, perception-challenging",
        prompts: [
            "Impossible geometric structure",
            "Art piece that changes with perspective",
            "Mural that plays with depth perception",
            "Illustration with hidden images",
            "3D artwork on a flat surface",
        ],
    },
    {
        template:
            "Mythical Creature Design {prompt} . Legendary beings, fantastical anatomy, imaginative interpretation",
        prompts: [
            "Reimagined version of a centaur",
            "Design of a modern-day dragon",
            "Sketch of an underwater leviathan",
            "Concept art for a forest sprite",
            "Illustration of a mythical hybrid creature",
        ],
    },
    {
        template:
            "professional 3d model {prompt} . octane render, highly detailed, volumetric, dramatic lighting",
        prompts: [
            "car",
            "person",
            "animal",
            "building",
            "natural landscape",
            "surreal dreamscape",
            "fourth dimension architecture",
        ],
    },
    {
        template:
            "analog film photo {prompt} . faded film, desaturated, 35mm photo, grainy, vignette, vintage, Kodachrome, Lomography, found footage",
        prompts: [
            "city street",
            "beach",
            "mountain landscape",
            "old barn",
            "abandoned place",
            "concept of time",
            "exploration of loneliness",
        ],
    },
    {
        template:
            "anime artwork {prompt} . anime style, key visual, vibrant, studio anime, highly detailed",
        prompts: [
            "main character",
            "fantasy creature",
            "futuristic vehicle",
            "natural landscape",
            "cityscape",
            "inner psyche",
            "alternate reality",
        ],
    },
    {
        template:
            "fauvism painting of {prompt} . bold colors, expressive brush strokes, simplified forms ",
        prompts: [
            "figure",
            "still life",
            "landscape",
            "interior scene",
            "abstract composition",
        ],
    },
    {
        template:
            "art nouveau illustration of a {prompt} . flowing organic lines, floral motifs, elegant style",
        prompts: [
            "woman",
            "insect",
            "plant",
            "building facade",
            "ornate border",
        ],
    },
    {
        template:
            "pointillism painting of {prompt} . tiny dots of pure color, mix optically, Seurat style",
        prompts: [
            "park scene",
            "river landscape",
            "cafe interior",
            "dreamlike setting",
            "shimmering light effect",
        ],
    },
    {
        template:
            "ukiyo-e woodblock print of a {prompt} . flat shapes, visible brush strokes, Japanese style",
        prompts: [
            "geisha",
            "samurai",
            "bird",
            "flower",
            "mountain vista",
            "river scene",
        ],
    },
    {
        template:
            "pop surrealism painting featuring {prompt} . imaginative, dreamlike, boldly stylized",
        prompts: [
            "a figure",
            "a creature",
            "a landscape",
            "an impossible object",
            "a surreal sculpture",
        ],
    },
    {
        template:
            "op art piece with {prompt} . optical illusions, disorienting patterns, seem to vibrate",
        prompts: [
            "black and white geometry",
            "impossible shapes",
            "kinetic spirals",
            "light illusions",
            "hypnotic waves",
        ],
    },
    {
        template:
            "minimalist painting of a {prompt} . extremely simplified, basic colors and shapes",
        prompts: [
            "figure",
            "fruit",
            "vardscape",
            "shapes",
            "geometric composition",
        ],
    },
    {
        template:
            "action painting featuring {prompt} . bold strokes, splatters, drips, dynamic style",
        prompts: [
            "vibrant colors",
            "thickly applied paint",
            "gestural brushwork",
            "emotional intensity",
            "abstract expressionism",
        ],
    },
    {
        template:
            "romantic seascape with {prompt} . turbulent oceans, awe-inspiring skies, J.M.W Turner style",
        prompts: [
            "stormy waves",
            "rocky cliffs",
            "old shipwrecks",
            "dark clouds and light rays",
            "lone ship fighting the elements",
        ],
    },
    {
        template:
            "nonsense poetry illustration depicting {prompt} . avant-garde, surreal juxtapositions ",
        prompts: [
            "an unlikely animal duo",
            "a peculiar contraption",
            "an absurdist garden",
            "a nonsensical food dish",
            "an impossible room layout",
        ],
    },
    {
        template:
            "magic realism painting of a {prompt} . dreamlike precision, marvelous realism",
        prompts: [
            "mysterious figure",
            "floating object",
            "impossible perspective",
            "eccentric characters",
            "rendezvous with mythical creature",
        ],
    },
];

// calculate and export prompts array which is a list of all prompts (substituting into the templates)

export const prompts = templatesAndPrompts.flatMap((templateAndPrompt) => {
    return templateAndPrompt.prompts.map((prompt) => {
        return {
            searchPrompt: templateAndPrompt.template.replace(
                "{prompt}",
                prompt,
            ),
            template: templateAndPrompt.template,
            prompt: prompt,
        };
    });
});
