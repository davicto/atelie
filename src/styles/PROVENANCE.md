# PROVENANCE — rastreabilidade do catálogo de estilos

Cada estilo de `catalog.ts` foi destilado dos 4 projetos de referência em
`Active/images-editor/`. A tabela mapeia cada `id` para os arquivos-fonte de
onde vieram as frases/abordagens (meio, composição, iluminação, câmera,
restrições). Caminhos relativos a `Active/images-editor/` — pasta **removida na
reorganização de 26/07/2026** (os 4 repos clonados não existem mais no disco); os
caminhos abaixo permanecem como registro de procedência.

Fontes transversais (princípios aplicados a TODOS os estilos):

- `GPT-Image2-Skill/skills/gpt-image/references/craft.md` — ordem canvas→sujeito,
  densidade de cena > adjetivos (§9), luz/material/paleta como controles separados
  (§12), texto literal entre aspas (§1), avoid-list curta e direcionada (§14),
  âncoras de estilo específicas e limitadas (§10), câmera/captura para fotorrealismo (§8).
- `garden-skills/skills/gpt-image-2/references/prompt-writing.md` — metodologia
  de campos (subject/scene/style/layout/constraints) e separação
  necessário/default/aleatório que embasa os slots `{subject}{scene}{extra}` + `defaults`.

| id | grupo | arquivo(s)-fonte principal(is) | o que veio de lá |
|---|---|---|---|
| `fotorrealista` | Fotografia & Cinema | `awesome-gpt-image/README.md` (RAW iPhone, 35mm film, direct flash, 90s point-and-shoot); `GPT-Image2-Skill/.../gallery-photography.md` (No. 63–65); `craft.md §8` | "RAW/unprocessed", 50mm, luz de janela, DoF raso, grão sutil; avoid-list |
| `cinematic-still` | Fotografia & Cinema | `GPT-Image2-Skill/.../gallery-cinematic-and-animation.md` (No. 27 noir chiaroscuro); `gallery-fashion-editorial.md` (No. 135 cinematic); `gallery-retro-and-cyberpunk.md` (35mm anamorphic) | frame de filme, chiaroscuro, 35mm anamórfico, teal/amber, haze volumétrico |
| `fashion-editorial` | Fotografia & Cinema | `GPT-Image2-Skill/.../gallery-fashion-editorial.md` (No. 129–135); `craft.md §12` | styling preciso, 85mm/50mm f/2.8, luz direcional, material/luz/paleta separados |
| `ilustracao-flat` | Pintura & Ilustração | `GPT-Image2-Skill/.../gallery-more-illustration-styles.md` (No. 141 flat design) | blocos de cor sólidos, sem gradiente/sombra, faces mínimas, paleta muted |
| `watercolor` | Pintura & Ilustração | `GPT-Image2-Skill/.../gallery-watercolor.md` (No. 48–49) | papel cold-press, wet-on-wet, espaço negativo, paleta harmônica limitada |
| `ink-chines` | Pintura & Ilustração | `GPT-Image2-Skill/.../gallery-ink-and-chinese.md` (No. 50–51); `craft.md §10` | papel xuan, gradações de tinta, liu-bai, selo vermelho, gongbi + tinta solta |
| `oleo-impasto` | Pintura & Ilustração | `GPT-Image2-Skill/.../gallery-fine-art-painting.md` (No. 136–137) | espátula, dollops, textura 3D da tinta, luz nas cristas, paleta saturada |
| `picture-book` | Pintura & Ilustração | `GPT-Image2-Skill/.../gallery-illustration.md` (No. 47 paper-cut); `gallery-more-illustration-styles.md` (No. 142) | papel recortado em camadas, sombras entre camadas, teste dos "três olhares" |
| `risograph` | Pintura & Ilustração | `GPT-Image2-Skill/.../gallery-more-illustration-styles.md` (No. 146 risograph) | 2 tintas spot, halftone granulado, misregistration, silhuetas chapadas |
| `chibi-kawaii` | Estilizado & Jogos | `GPT-Image2-Skill/.../gallery-more-illustration-styles.md` (No. 142 chibi, No. 145 kawaii sticker) | cabeça grande/olhos brilhantes, line art marrom, pastel-rainbow, twinkles |
| `low-poly` | Estilizado & Jogos | `GPT-Image2-Skill/.../gallery-more-illustration-styles.md` (No. 143 low-poly) | facetas triangulares, luz por ângulo do polígono, céu em bandas |
| `pixel-art` | Estilizado & Jogos | `GPT-Image2-Skill/.../gallery-pixel-art.md` (No. 52–53); `awesome-gpt-image/README.md` (grid de itens pixel) | 16-bit SNES, sem anti-alias, paleta ~16 tons, dithering, silhuetas legíveis |
| `isometrico-3d` | Estilizado & Jogos | `GPT-Image2-Skill/.../gallery-isometric.md` (No. 54–55) | isometria 30°, diorama flutuante, oclusão ambiente, tile logic, sem sombra de chão |
| `render-3d-kawaii` | Estilizado & Jogos | `GPT-Image2-Skill/.../gallery-cinematic-and-animation.md` (No. 26 Pixar still); `craft.md §12` | formas rechonchudas, SSS, PBR, materiais skeuomórficos, 3-point + rim |
| `anime-key-visual` | Estilizado & Jogos | `GPT-Image2-Skill/.../gallery-anime-and-manga.md` (No. 1 MAPPA, No. 2 Naruto) | cel shading, line art nítido, rim light, speed lines, perspectiva dinâmica |
| `cyberpunk-retro` | Estilizado & Jogos | `GPT-Image2-Skill/.../gallery-retro-and-cyberpunk.md` (No. 23–25) | neon na chuva, reflexos no asfalto, glyphs holográficos, flares anamórficos, IP original |
| `sticker` | Assets & Produto | `GPT-Image2-Skill/.../gallery-more-illustration-styles.md` (No. 144 die-cut, No. 145) | borda branca grossa, acabamento glossy, drop shadow "descolando", motivo isolado |
| `logo-icone` | Assets & Produto | `GPT-Image2-Skill/.../gallery-brand-systems-and-identity.md` (No. 60–62 logo studies); `craft.md §15 (brand systems)` | geometria memorável, paleta restrita, escalável, wordmark opcional |
| `product-render` | Assets & Produto | `GPT-Image2-Skill/.../gallery-product-and-food.md` (No. 56–59, config JSON); `craft.md §3, §12` | packshot 3/4, softbox, materiais separados, bokeh, negative space, avoid CGI |
| `exploded-cutaway` | Assets & Produto | `GPT-Image2-Skill/.../gallery-technical-illustration.md` (No. 112–116); `craft.md §15` | separação por eixo/corte, leader lines, callouts "01"–"10", specs, scale marker |
| `tattoo-flash` | Assets & Produto | `GPT-Image2-Skill/.../gallery-tattoo-design.md` (No. 157–160); `craft.md §15 (tattoo)` | flash em papel off-white, stencil-ready, negative-space, tokens BLACK & GREY/irezumi |
| `infografico-bento` | Informação & Diagrama | `GPT-Image2-Skill/.../gallery-infographics-and-field-guides.md` (No. 69–72 knowledge cards); `awesome-gpt-image/README.md` (coffee journey); `craft.md §4` | cartões modulares arredondados, hierarquia de título, scorecard, callouts |
| `infografico-hand-drawn` | Informação & Diagrama | `GPT-Image2-Skill/.../gallery-infographics-and-field-guides.md` (No. 73 camera styles, No. 74 endangered animal) | board multi-painel desenhado à mão, anotações, vinhetas por tópico |
| `figura-paper` | Informação & Diagrama | `GPT-Image2-Skill/.../gallery-research-paper-figures.md` (No. 75–95); `craft.md §5` | fundo branco, ≤3 cores, boxes-and-arrows, labels A–D, "no invented data" |
| `diagrama-tecnico` | Informação & Diagrama | `GPT-Image2-Skill/.../gallery-research-paper-figures.md` (No. 79–82, 95 grammar); `craft.md §5` | zonas/colunas, semântica de linha (solid/dashed), espessura ∝ quantidade |
| `data-viz` | Informação & Diagrama | `GPT-Image2-Skill/.../gallery-data-visualization.md` (No. 107–111); `craft.md §5 (mini-schema)` | nomear família do gráfico, escalas alinhadas, legenda/unidades, paleta editorial |
| `mapa-ilustrado` | Informação & Diagrama | `GPT-Image2-Skill/.../gallery-isometric.md` (No. 55 fantasy village map); `gallery-typography-and-posters.md` (No. 38 Boston river-map); `garden-skills/.../prompt-writing.md §5.7 (itinerary map)` | rota, marcos, rosa-dos-ventos, legenda, terreno estilizado |
| `poster-tipografico` | Pôster & Interface | `GPT-Image2-Skill/.../gallery-typography-and-posters.md` (No. 33–45, esp. No. 35 Saul Bass); `craft.md §11` | hierarquia promocional, texto literal entre aspas, legível à distância, avoid microtext |
| `ui-mockup` | Pôster & Interface | `GPT-Image2-Skill/.../gallery-ui-ux-mockups.md` (No. 102–106); `awesome-gpt-image/README.md` (e-commerce/music player); `craft.md §6` | device/canvas, IA completa, dados exatos, "reads like product spec", avoid filler |
