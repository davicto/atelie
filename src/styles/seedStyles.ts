import type { StyleDef } from './catalog.types';

/**
 * Estilos do AUTOR embarcados no app: aparecem como "meu estilo" em toda
 * instalação, já na primeira abertura, com as imagens de referência juntas.
 *
 * As imagens vivem em `assets/style-covers/<id>/` como WebP de 1600px, geradas
 * de `~/.atelie` por `scripts/bundle-style-assets.py`. Os originais são PNG de 2K
 * (131 MB no conjunto todo) — pesado demais para um repositório e para o
 * instalador; em resolução de exibição o conjunto cai para ~9 MB.
 */
export interface SeedStyle {
  style: StyleDef;
  /** Arquivos em `assets/style-covers/<id>/`; o primeiro é a capa do card. */
  refs?: string[];
}

export const SEED_STYLES: SeedStyle[] = [
  {
    refs: ['01-7.webp', '02-9.webp', '03-11.webp', '04-17.webp', '05-elidaria.webp', '06-leticia.webp', '07-lumina.webp'],
    style: {
      id: 'aquarela-bosque',
      nome: 'Aquarela - Bosque',
      grupo: 'Meus estilos',
      desc: 'Aquarela e nanquim infantil sobre papel marfim, traço encorpado e olhos em amêndoa brilhantes.',
      template:
        'Children\'s educational book illustration in the "Bosque Mananciais" house style: hand-painted watercolour plus alcohol-marker (Copic) colour over confident black India-ink linework, laid on warm ivory cold-press watercolour paper whose fine grain shows through the paint. {subject}. {scene} Linework: few, economical, decisive strokes made in one pass with a well-inked medium/thick brush pen — the outer contour is bold, opaque, continuous and clearly heavier than the sparse thinner interior lines (folds, fingers, hair strands); natural swelling and tapering, no hatching, no sketchy or doubled edges, no hairline technical-pen strokes. Colour: watercolour mottling and gentle wet-blend gradients, subtle dry-brush texture, never flat uniform fills; simple 2-3 tone shading (base plus one deeper, slightly more saturated shadow, optional highlight left as bare paper) and a small soft blurred contact shadow under standing figures. Eyes are the signature: large rounded almond shape, strong thick curved upper eyelid as the dominant line thickening toward the outer corner, minimal or absent lower lid, wide-set and symmetrical, oversized iris filling almost the whole opening with barely any visible sclera, darker outer ring and dark pupil, one larger plus one smaller round white highlight high on the iris matching in both eyes; owl mascots instead get two huge circular eyes with a yellow-orange ring. Friendly rounded faces, minimal one-stroke nose, simple smiling mouth, soft watery blush on the cheeks, warm diverse skin tones. Two coexisting sub-styles kept strictly apart: chibi children at 2.5-3 heads with big heads, compact bodies, very thick rounded outlines and saturated marker colour; semi-realistic adults at 5-6 heads with medium-but-marked outlines and richer detail in hair, fabric and jewellery — children must read as visibly shorter than adults, never as small adults. Soft diffuse light from above and in front, no drama, no cast geometric shadows. Palette restricted to the official set: earthy terracottas, ochres, sands, mustards and dusty blues for skin, hair, wood and calm ground, with vivid teal, cobalt, leaf green, gold, orange and deep red as accents. Warm, curious, optimistic and educational mood, nature-water-forest themes. {extra} Avoid: pure white or flat digital background, vector or flat design, 3D render, photographic realism, thin hairline or pale grey outlines, sketchy scribbled or hatched strokes, small dull eyes with lots of visible white or fully outlined lids, neon or off-palette colours, dramatic lighting, hard cast shadows, scary content, off-model characters, watermark, text.',
      defaults: { size: '2K', quality: 'high', aspect: 'portrait', background: 'auto', format: 'png' },
      origem: 'user',
    },
  },
];
