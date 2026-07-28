import type { StyleDef } from './catalog.types';

/**
 * Galeria fixa de estilos, destilada dos 4 projetos de referência
 * (ver PROVENANCE.md). Cada `template` está em inglês (o modelo responde melhor)
 * e segue a estrutura consolidada:
 * [USO/MODO][ESTILO/MEIO][{subject}][{scene}][COMPOSIÇÃO][ILUMINAÇÃO][CÂMERA][{extra}][RESTRIÇÕES].
 * Tamanho/fundo/formato ficam em `defaults` (viram flags), nunca no texto.
 * Só `sticker` e `logo-icone` usam background 'transparent'.
 */
export const CATALOG: StyleDef[] = [
  // ── Fotografia & Cinema ──────────────────────────────────────────────
  {
    id: 'fotorrealista',
    nome: 'Fotorrealista',
    desc: 'Foto RAW editorial, luz natural e textura fiel — sem cara de IA.',
    grupo: 'Fotografia & Cinema',
    template:
      'Photorealistic RAW photo, editorial quality. {subject}. {scene} Shot on 50mm lens, natural window light, shallow depth of field, true-to-life skin and material texture, subtle film grain. {extra} Avoid: illustration, cartoon look, oversaturation, watermark, extra text.',
    defaults: { size: '2K', quality: 'high', aspect: 'landscape', background: 'auto', format: 'png' },
  },
  {
    id: 'cinematic-still',
    nome: 'Still cinematográfico',
    desc: 'Frame de filme, color grade teal/amber, luz chiaroscuro anamórfica.',
    grupo: 'Fotografia & Cinema',
    template:
      'Cinematic film still, feature-film color grade, anamorphic look. {subject}. {scene} Strong foreground-midground-background depth, chiaroscuro contrast, motivated practical lighting, teal-and-amber palette, volumetric haze and a subtle lens flare. Shot on 35mm anamorphic, shallow depth of field, filmic grain. {extra} Avoid: flat snapshot lighting, cartoon look, uncanny plastic skin, watermark, captions.',
    defaults: { size: '2K', quality: 'high', aspect: 'landscape', background: 'auto', format: 'png' },
  },
  {
    id: 'fashion-editorial',
    nome: 'Editorial de moda',
    desc: 'Foto de moda de revista: styling preciso, prime 85mm, luz direcional.',
    grupo: 'Fotografia & Cinema',
    template:
      'High-fashion editorial photograph, magazine-quality styling. {subject}. {scene} Precise wardrobe, fabrics and accessories, a striking pose and location, strong silhouette and editorial mood; treat material, lighting and palette as separate controls. Directional key light with fashion-grade shadow falloff, shot on an 85mm or 50mm prime at shallow depth of field, fine film grain, natural skin tones. {extra} Avoid: snapshot look, over-processing, plastic skin, visible brand logos, garbled text.',
    defaults: { size: '2K', quality: 'high', aspect: 'portrait', background: 'auto', format: 'png' },
  },

  // ── Pintura & Ilustração ─────────────────────────────────────────────
  {
    id: 'ilustracao-flat',
    nome: 'Ilustração flat',
    desc: 'Vetor flat editorial: blocos de cor sólidos, sem sombra nem gradiente.',
    grupo: 'Pintura & Ilustração',
    template:
      'Clean vector-based flat illustration, modern editorial style. {subject}. {scene} Simplified elegant shapes, solid overlapping color blocks with crisp edges, generous negative space, geometric hills and foliage, characters with minimal or no facial features. Even flat lighting with no gradients and no cast shadows, harmonious muted palette. {extra} Avoid: photorealism, 3D render, heavy outlines, gritty texture, drop shadows.',
    defaults: { size: '2K', quality: 'medium', aspect: 'square', background: 'auto', format: 'png' },
  },
  {
    id: 'watercolor',
    nome: 'Aquarela',
    desc: 'Aquarela delicada em papel cold-press, sangramentos e espaço negativo.',
    grupo: 'Pintura & Ilustração',
    template:
      'Delicate watercolor illustration on textured cold-press paper. {subject}. {scene} Soft pigment bleeds, visible brush strokes, gentle gradients, airy negative space, limited harmonious palette. {extra} Avoid: hard vector edges, 3D render, photographic realism, heavy black outlines.',
    defaults: { size: '2K', quality: 'high', aspect: 'portrait', background: 'auto', format: 'png' },
  },
  {
    id: 'ink-chines',
    nome: 'Tinta chinesa (shui-mo)',
    desc: 'Pintura sumi/gongbi em papel xuan, gradações de tinta e liu-bai.',
    grupo: 'Pintura & Ilustração',
    template:
      'Traditional Chinese ink-wash (shui-mo) painting on aged xuan rice paper. {subject}. {scene} Layered ink gradations from a bold dark foreground to pale misty distance, calligraphic brush-energy in every stroke, generous liu-bai negative-space clouds, a single small red seal stamp in a corner. Restrained monochrome ink with a faint warm paper tone, gongbi-level detail meeting loose atmosphere. {extra} Avoid: anime faces, modern objects, fake calligraphy clutter, saturated poster lighting, hard outlines.',
    defaults: { size: '2K', quality: 'high', aspect: 'portrait', background: 'auto', format: 'png' },
  },
  {
    id: 'oleo-impasto',
    nome: 'Óleo impasto',
    desc: 'Óleo pós-impressionista com espátula, pincelada grossa e textura 3D.',
    grupo: 'Pintura & Ilustração',
    template:
      'Expressive oil painting with heavy impasto, in the lineage of post-impressionism. {subject}. {scene} Thick rhythmic palette-knife strokes and heavy dollops building tangible 3D paint texture, turbulent visible brushwork, no flat surfaces. Harsh directional light catching the peaks and ridges of the paint, saturated painterly palette. {extra} Avoid: smooth digital shading, flat vector look, photographic realism, clean edges.',
    defaults: { size: '2K', quality: 'high', aspect: 'landscape', background: 'auto', format: 'png' },
  },
  {
    id: 'picture-book',
    nome: 'Livro ilustrado',
    desc: 'Ilustração de livro infantil / papel recortado em camadas, aconchegante.',
    grupo: 'Pintura & Ilustração',
    template:
      'Storybook picture-book illustration, mid-century children\'s-book charm meeting layered paper-cut diorama. {subject}. {scene} Warm hand-crafted shapes, visible cut-paper edges and soft shadows between layers, cozy narrative props and small expressive character gestures, tiny hand-drawn signage. Gentle storybook lighting, muted warm palette (moss green, pumpkin orange, cream, ink blue), handmade paper texture. {extra} Avoid: photorealism, glossy 3D plastic look, cluttered unreadable faces, harsh digital gradients.',
    defaults: { size: '2K', quality: 'high', aspect: 'landscape', background: 'auto', format: 'png' },
  },
  {
    id: 'risograph',
    nome: 'Risograph',
    desc: 'Impressão riso 2 cores: grão, halftone e misregistration proposital.',
    grupo: 'Pintura & Ilustração',
    template:
      'Two-color risograph print illustration. {subject}. {scene} Limited spot-ink palette (e.g. fluorescent pink and teal blue) with a darker tone where inks overlap, grainy tactile halftone texture, slight intentional misregistration, flat bold silhouettes and shapes. Lighting implied through halftone dot density, gritty lo-fi zine aesthetic. {extra} Avoid: smooth gradients, full-color realism, clean digital vector flatness, photographic detail.',
    defaults: { size: '2K', quality: 'medium', aspect: 'portrait', background: 'auto', format: 'png' },
  },

  // ── Estilizado & Jogos ───────────────────────────────────────────────
  {
    id: 'chibi-kawaii',
    nome: 'Chibi kawaii',
    desc: 'Q-style fofo: cabeça grande, olhos brilhantes, paleta pastel.',
    grupo: 'Estilizado & Jogos',
    template:
      'Hyper-cute chibi / Q-style illustration. {subject}. {scene} Characters with oversized heads, large twinkling eyes and tiny limbs, soft rounded dark-brown line art (not black), pastel-rainbow palette (mint, strawberry pink, lavender, lemon). Warm sparkly lighting with small twinkle effects and gentle white glows, cozy rounded environment. {extra} Avoid: realistic proportions, harsh black outlines, dark or gritty mood, photorealism.',
    defaults: { size: '1K', quality: 'medium', aspect: 'square', background: 'auto', format: 'png' },
  },
  {
    id: 'low-poly',
    nome: 'Low-poly',
    desc: 'Geometria facetada de triângulos, luz por ângulo do polígono.',
    grupo: 'Estilizado & Jogos',
    template:
      'Stylized low-poly geometric illustration built entirely from flat-shaded triangles and quads. {subject}. {scene} Every surface a crisp facet with no curves or gradients, faceted light-and-shadow calculated by polygon angle, sky as horizontal bands of color. Clean digital lighting, palette shifting distinctly across the facets. {extra} Avoid: smooth curves, soft gradients, photographic texture, painterly brushwork.',
    defaults: { size: '2K', quality: 'medium', aspect: 'landscape', background: 'auto', format: 'png' },
  },
  {
    id: 'pixel-art',
    nome: 'Pixel art',
    desc: 'Pixel art 16-bit SNES: bordas nítidas, paleta ~16 tons, sem anti-alias.',
    grupo: 'Estilizado & Jogos',
    template:
      'Clean pixel art, 16-bit SNES-era aesthetic. {subject}. {scene} Crisp pixel edges with no anti-aliasing, a limited palette of about 16 tones, consistent 3/4 top-down or side perspective, readable silhouettes, careful dithered shading. Deliberate hard pixel lighting. {extra} Avoid: anti-aliasing, blur, smooth gradients, high-resolution photoreal detail, modern 3D shading.',
    defaults: { size: '1K', quality: 'medium', aspect: 'square', background: 'auto', format: 'png' },
  },
  {
    id: 'isometrico-3d',
    nome: 'Isométrico 3D',
    desc: 'Miniatura isométrica 30°, diorama flutuante com oclusão ambiente.',
    grupo: 'Estilizado & Jogos',
    template:
      'Detailed isometric 3D miniature scene, precise 30-degree isometric alignment. {subject}. {scene} Clean geometric forms, high-detail miniature texturing, tidy tile logic, stylised tiny props and pedestrians. Soft ambient light from the upper-left with subtle ambient occlusion in corners and no harsh shadows, muted pastel palette, slight atmospheric haze. Scene floating like a diorama on a flat soft-tone background. {extra} Avoid: perspective distortion, ground-plane cast shadow, photoreal clutter, messy alignment.',
    defaults: { size: '2K', quality: 'high', aspect: 'square', background: 'auto', format: 'png' },
  },
  {
    id: 'render-3d-kawaii',
    nome: 'Render 3D kawaii',
    desc: 'CG estilizado tipo Pixar: formas fofas, materiais skeuomórficos, SSS.',
    grupo: 'Estilizado & Jogos',
    template:
      'Glossy 3D-rendered kawaii miniature, Pixar-adjacent stylised CG. {subject}. {scene} Rounded chunky shapes, soft matte-and-glossy skeuomorphic materials, big expressive eyes, subsurface scattering on thin parts, physically based shading. Soft studio three-point lighting, gentle ambient occlusion and rim light, pastel palette, shallow depth of field. {extra} Avoid: photoreal uncanny-valley, sharp gritty realism, flat 2D look, harsh shadows.',
    defaults: { size: '2K', quality: 'high', aspect: 'square', background: 'auto', format: 'png' },
  },
  {
    id: 'anime-key-visual',
    nome: 'Anime key visual',
    desc: 'Key visual 2D cel-shaded, line art nítido, rim light e speed lines.',
    grupo: 'Estilizado & Jogos',
    template:
      'High-end anime key visual, modern polished 2D cel-shaded rendering. {subject}. {scene} Crisp confident line art, luminous eyes, heavy cel shading with strong rim light, dynamic perspective and speed lines where the action calls for it, saturated-but-controlled palette, cinematic composition. Dramatic backlight and motion-blur accents. {extra} Avoid: photorealism, muddy 3D render, western-cartoon proportions, watermark, garbled kanji.',
    defaults: { size: '2K', quality: 'high', aspect: 'landscape', background: 'auto', format: 'png' },
  },
  {
    id: 'cyberpunk-retro',
    nome: 'Cyberpunk retrô',
    desc: 'Anime-cyberpunk anos 90: neon na chuva, reflexos, flares anamórficos.',
    grupo: 'Estilizado & Jogos',
    template:
      'Retro-future cyberpunk key visual, late-90s anime-cyberpunk aesthetic. {subject}. {scene} Rain-soaked neon night, layered magenta-cyan signage, wet-asphalt reflections, holographic UI glyphs, dense but readable set dressing, original designs only. Moody low-key lighting with warm sodium accents over cold teal ambient, volumetric god rays, glossy specular highlights, 35mm anamorphic flares. {extra} Avoid: existing IP, present-day plainness, muddy composition, fake kanji clutter, explicit content.',
    defaults: { size: '2K', quality: 'high', aspect: 'landscape', background: 'auto', format: 'png' },
  },

  // ── Assets & Produto ─────────────────────────────────────────────────
  {
    id: 'sticker',
    nome: 'Sticker die-cut',
    desc: 'Adesivo recortado com borda branca grossa e acabamento vinílico.',
    grupo: 'Assets & Produto',
    template:
      'Die-cut sticker design with a thick white border and glossy vinyl finish. {subject}. {scene} Bold clean outlines, saturated tasteful colors, simple iconic shapes, a subtle specular highlight and soft drop shadow so it reads as a peeling sticker, single centered motif isolated with nothing behind it. {extra} Avoid: busy background, photorealism, tiny unreadable detail, gradients that muddy the shapes, brand logos.',
    defaults: { size: '1K', quality: 'medium', aspect: 'square', background: 'transparent', format: 'png' },
  },
  {
    id: 'logo-icone',
    nome: 'Logo / ícone',
    desc: 'Marca ou app-icon: geometria simples, escalável, paleta restrita.',
    grupo: 'Assets & Produto',
    template:
      'Clean logo / app-icon design, presented as a tidy mark isolated with nothing behind it. {subject}. {scene} Simple memorable geometry, balanced proportions, crisp vector-like edges, a strictly limited palette, scalable and legible at small size, an optional tiny wordmark. Even flat lighting, no scene clutter, subtle depth only if skeuomorphic. Keep any lettering short, exact and correctly spelled. {extra} Avoid: photorealism, busy detail, gradients that fail at small size, fake existing brand logos, background clutter.',
    defaults: { size: '1K', quality: 'medium', aspect: 'square', background: 'transparent', format: 'png' },
  },
  {
    id: 'product-render',
    nome: 'Product render',
    desc: 'Packshot de estúdio premium: hero em 3/4, materiais e softbox.',
    grupo: 'Assets & Produto',
    template:
      'Premium commercial product render, studio packshot quality. {subject}. {scene} Hero product centered at a refined three-quarter angle, minimal premium studio set, realistic material textures (brushed metal, glass, condensation, matte paperboard), accurate undistorted packaging type, subtle reflections. Directional softbox key with soft fill and glossy specular highlights, gentle shadow, cinematic bokeh, generous negative space. {extra} Avoid: cheap e-commerce banner, plastic CGI tell, fake brand logos, distorted labels, cluttered props.',
    defaults: { size: '2K', quality: 'high', aspect: 'portrait', background: 'auto', format: 'png' },
  },
  {
    id: 'exploded-cutaway',
    nome: 'Exploded / cutaway',
    desc: 'Vista explodida ou corte técnico com callouts numerados e specs.',
    grupo: 'Assets & Produto',
    template:
      'Premium technical exploded-view / cutaway illustration, industrial-design plate. {subject}. {scene} Components separated along a precise axis, or semi-transparent bodywork revealing internals, ordered layers with crisp leader lines and numbered callouts, realistic engineering materials, exact part labels and spec text, a small scale marker or legend. Clean even technical lighting on a neutral or blueprint-grid background, sharp hierarchy. Keep all labels in quotes and correctly spelled. {extra} Avoid: vague blob shapes, wrong or missing labels, photoreal clutter, decorative gradients, garbled text.',
    defaults: { size: '2K', quality: 'high', aspect: 'landscape', background: 'auto', format: 'png' },
  },
  {
    id: 'tattoo-flash',
    nome: 'Tattoo flash',
    desc: 'Prancha de tatuagem em papel off-white, contornos stencil-ready.',
    grupo: 'Assets & Produto',
    template:
      'Tattoo flash design sheet presented on warm off-white paper (not on real skin). {subject}. {scene} Clean stencil-ready outlines, confident linework, deliberate negative-space gaps for skin breathing room, a faint placement silhouette behind the artwork and small style labels in clean caps. Even flash-sheet lighting, a tradition-appropriate palette (bold black-and-grey dotwork, saturated neo-traditional, or classic irezumi flats), visible paper grain. {extra} Avoid: gore or body horror, real human skin photo, brand logos, tiny detail that will not tattoo, muddy shading.',
    defaults: { size: '2K', quality: 'high', aspect: 'portrait', background: 'auto', format: 'png' },
  },

  // ── Informação & Diagrama ────────────────────────────────────────────
  {
    id: 'infografico-bento',
    nome: 'Infográfico bento',
    desc: 'Cartões modulares arredondados em grid, estilo knowledge-card.',
    grupo: 'Informação & Diagrama',
    template:
      'Modular bento-grid infographic, collectible knowledge-card aesthetic. {subject}. {scene} Clean light background, rounded modular information cards in a tidy grid, strong title hierarchy, refined small icons, numbered sections, one clear hero visual plus zoomed detail callouts and a compact scorecard. High information density but uncrowded, soft palette, subtle shadows. Render every displayed string in quotes, legible and correctly spelled. {extra} Avoid: commercial promo-poster feel, tiny unreadable microtext, garbled characters, clutter.',
    defaults: { size: '2K', quality: 'high', aspect: 'portrait', background: 'auto', format: 'png' },
  },
  {
    id: 'infografico-hand-drawn',
    nome: 'Infográfico à mão',
    desc: 'Field-guide desenhado à mão: vinhetas, anotações e lead lines.',
    grupo: 'Informação & Diagrama',
    template:
      'Hand-drawn illustrated infographic / field-guide board, warm sketchbook aesthetic. {subject}. {scene} A multi-panel reference layout with labeled sections, hand-inked annotations and lead lines, loose marker-and-pencil illustrations, numbered callouts, mixed hand-lettered and neat labels, each mini-topic rendered in its own little vignette. Even readable lighting, muted natural palette, tactile paper texture. Keep labels short, legible and correctly spelled. {extra} Avoid: sterile corporate vector flatness, tiny unreadable text, garbled characters, overcrowding.',
    defaults: { size: '2K', quality: 'high', aspect: 'landscape', background: 'auto', format: 'png' },
  },
  {
    id: 'figura-paper',
    nome: 'Figura de paper',
    desc: 'Figura acadêmica limpa, fundo branco, ≤3 cores, boxes-and-arrows.',
    grupo: 'Informação & Diagrama',
    template:
      'Clean academic paper figure, publication style, white background, at most 3 engineering colors, thin lines, sans-serif labels. {subject}. {scene} Clear boxes-and-arrows layout, numbered/lettered labels, legible at print size, monochrome-safe. {extra} Do NOT invent quantitative data; avoid decorative gradients, avoid photorealism.',
    defaults: { size: '2K', quality: 'high', aspect: 'landscape', background: 'auto', format: 'png' },
  },
  {
    id: 'diagrama-tecnico',
    nome: 'Diagrama técnico',
    desc: 'Diagrama de sistemas com gramática de setas, zonas e semântica de linha.',
    grupo: 'Informação & Diagrama',
    template:
      'Technical systems diagram with strict diagram grammar. {subject}. {scene} A left-to-right or zoned flow of labeled boxes, nodes, arrows and dashed dividers, directed relationships with clear arrowheads, exact module names and a legend, line semantics (solid = primary flow, dashed = secondary), thickness proportional to quantity where relevant. White background, thin precise vector-like lines, generous margins, large readable labels. {extra} Avoid: decorative illustration, photorealism, clutter, unlabeled shapes, garbled text.',
    defaults: { size: '2K', quality: 'high', aspect: 'landscape', background: 'auto', format: 'png' },
  },
  {
    id: 'data-viz',
    nome: 'Data-viz',
    desc: 'Gráfico editorial: família nomeada, escalas alinhadas, encoding claro.',
    grupo: 'Informação & Diagrama',
    template:
      'Editorial data-visualization figure, publication-grade. {subject}. {scene} Name the chart family and structure explicitly (small-multiples grid, network graph, chord diagram, treemap, choropleth), consistent aligned scales, exact axis labels, legend values and units, a restrained categorical palette with clear encoding, a title and subtitle block. White or ivory background, generous margins, crisp typography. Keep every label in quotes and correctly spelled; do not fabricate implausible numbers. {extra} Avoid: generic clip-art infographic styling, cluttered overlaps, unreadable microtext, 3D chart junk.',
    defaults: { size: '2K', quality: 'high', aspect: 'landscape', background: 'auto', format: 'png' },
  },
  {
    id: 'mapa-ilustrado',
    nome: 'Mapa ilustrado',
    desc: 'Mapa desenhado à mão: rota, marcos, rosa-dos-ventos e legenda.',
    grupo: 'Informação & Diagrama',
    template:
      'Hand-illustrated map, charming cartographic illustration. {subject}. {scene} Readable map logic with clear paths, landmarks and labeled locations, a compass rose and a small legend, cohesive stylised terrain, gentle atmospheric depth; either a game-ready isometric tile map or a painted top-down city/region map. Warm directional light with soft long shadows, a harmonious controlled palette. Keep place labels short, legible and correctly spelled. {extra} Avoid: photorealism, GPS-app sterility, cluttered unreadable labels, garbled text, distorted geometry.',
    defaults: { size: '2K', quality: 'high', aspect: 'landscape', background: 'auto', format: 'png' },
  },

  // ── Pôster & Interface ───────────────────────────────────────────────
  {
    id: 'poster-tipografico',
    nome: 'Pôster tipográfico',
    desc: 'Pôster com hierarquia promocional forte e texto literal legível.',
    grupo: 'Pôster & Interface',
    template:
      'Typographic promotional poster with a clear visual hierarchy. {subject}. {scene} Largest element is the title, then the tagline, then supporting modules, then fine print; bold layout, a strong silhouette readable from a distance, deliberate negative space, a cohesive limited palette. Render every displayed string exactly as given, in quotes, crisp and legible with no garbled characters. Studio-clean graphic lighting. {extra} Avoid: flat same-weight text blocks, unreadable microtext, fake sponsor logos, garbled characters, cluttered layout.',
    defaults: { size: '2K', quality: 'high', aspect: 'portrait', background: 'auto', format: 'png' },
  },
  {
    id: 'ui-mockup',
    nome: 'UI mockup',
    desc: 'Mockup de interface como screenshot real, com labels e dados exatos.',
    grupo: 'Pôster & Interface',
    template:
      'High-fidelity product UI mockup that reads like a real screenshot. {subject}. {scene} State the device/canvas and product context, a complete information architecture (status bar, header, cards, charts, list rows, nav), a realistic component system, crisp typography, precise icon alignment, plausible product data. Even flat interface lighting, subtle shadows, clean spacing, tight grid. Include exact in-image labels and numbers in quotes, correctly spelled. {extra} Avoid: vague "modern/clean" filler, misaligned components, garbled text, Dribbble-concept unrealism, real brand logos.',
    defaults: { size: '2K', quality: 'high', aspect: 'portrait', background: 'auto', format: 'png' },
  },
];
