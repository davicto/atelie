import fs from 'fs';
import path from 'path';
import { generate as codexGenerate } from './imageBackend';
import { styleLock } from './userStyles';
import { spritePath } from './projects';
import type { CastMember, Project } from './projects';
import type { GenJob, GenMeta, ProgressEvent } from '../types';

export interface SpriteOpts {
  size?: string;
  quality?: string;
  /** Ajuste livre do usuário na regeração ("mais sorridente", "sem chapéu"…). */
  extra?: string;
  onProgress?: (e: ProgressEvent) => void;
  onLog?: (msg: string) => void;
  signal?: AbortSignal;
}

/** Extensões que o backend aceita como `--ref-image`. */
const REF_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

/** Referências do personagem que ainda existem em disco (até 16, limite do backend). */
export function usableRefs(m: CastMember): string[] {
  return m.refs.filter((r) => REF_EXT.has(path.extname(r).toLowerCase()) && fs.existsSync(r)).slice(0, 16);
}

/**
 * Prompt da FOLHA DE SPRITE (character sheet): trava de estilo + trava visual do
 * personagem + poses/expressões em fundo neutro. Com referências, o modo é `edit`
 * e o texto reforça "mantenha idêntico à(s) referência(s)".
 *
 * O `extra` (ajuste pedido na regeração) é a ÚNICA coisa que deve divergir da
 * referência, então ele não pode entrar como linha solta no fim: a trava "keep
 * IDENTICAL … same face, hair, outfit, colors" vinha logo antes e vencia o pedido —
 * o usuário pedia "cabelo mais curto" e recebia o sprite inalterado. Com ajuste, o
 * pedido é anunciado ANTES da grade e a trava passa a abrir exceção explícita para ele.
 */
export function buildSpritePrompt(
  member: CastMember,
  estiloId: string | null,
  comReferencia: boolean,
  extra?: string,
): string {
  // MESMA trava usada pelos painéis da série (serieRun.canonFromSpec): o sprite é a
  // âncora contra a qual o juiz compara cada painel — travas diferentes nos dois
  // lados viram "deriva de estilo" na nota de consistência.
  const lock = styleLock(estiloId);
  const ajuste = extra?.trim();
  const parts: string[] = [];
  if (lock) parts.push(`Art style: ${lock}`);
  parts.push(`Character sprite sheet of ${member.nome}${member.descricao ? `: ${member.descricao}` : ''}.`);
  if (ajuste) {
    parts.push(
      comReferencia
        ? `REQUIRED CHANGE — this is an intentional edit requested by the art director and it OVERRIDES the reference image(s): ${ajuste}. ` +
            'The new sheet must visibly differ from the reference on exactly this point.'
        : `REQUIRED CHANGE requested by the art director, apply it to the character: ${ajuste}.`,
    );
  }
  parts.push(
    'Same single character repeated in a clean grid: full body front view, full body side view, full body back view, ' +
      'plus three head close-ups with different expressions (neutral, happy, surprised). ' +
      'Consistent proportions and colors across every pose, plain flat neutral background, no scenery, no props, no text, no labels.',
  );
  if (comReferencia) {
    parts.push(
      ajuste
        ? `Keep the character identical to the reference image(s) — same face, hair, outfit, colors and line style — EXCEPT for the required change above (${ajuste}), which must be clearly visible and applied consistently in every pose and close-up. Everything not covered by that change stays identical to the reference.`
        : 'Keep the character IDENTICAL to the reference image(s): same face, hair, outfit, colors and line style; only change pose and expression.',
    );
  } else if (ajuste) {
    parts.push(`Apply the required change consistently in every pose and close-up: ${ajuste}.`);
  }
  return parts.join(' ');
}

/**
 * Gera (ou regera) o sprite de um personagem em
 * `~/.atelie/projects/<projeto>/cast/<personagem>/sprite.png`.
 *
 * Com imagens de referência → `edit` multi-ref (o rosto/roupa vêm da foto do
 * usuário). Sem referências → `generate` a partir da descrição textual.
 * Regerar SEMPRE zera a aprovação: o usuário revalida o que mudou.
 */
export async function generateSprite(
  project: Project,
  member: CastMember,
  opts: SpriteOpts = {},
): Promise<{ pngPath: string; meta: GenMeta }> {
  const refs = usableRefs(member);
  const outPath = spritePath(project.id, member.id);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const extra = opts.extra ?? member.ajuste;
  const job: GenJob = {
    id: `sprite-${member.id}`,
    styleId: project.estiloId ?? 'custom',
    index: 0,
    prompt: buildSpritePrompt(member, project.estiloId, refs.length > 0, extra),
    mode: refs.length ? 'edit' : 'generate',
    ...(refs.length ? { refs, refPng: refs[0] } : {}),
    outPath,
  };

  opts.onLog?.(
    refs.length
      ? `sprite de ${member.nome}: editando a partir de ${refs.length} referência(s)…`
      : `sprite de ${member.nome}: gerando pela descrição (sem referências)…`,
  );
  const { pngPath, meta } = await codexGenerate(
    job,
    opts.size ?? '2K',
    opts.quality ?? 'high',
    opts.onProgress,
    opts.signal,
  );

  member.spritePng = pngPath;
  member.aprovado = false;
  member.ajuste = extra?.trim() || undefined;
  member.atualizadoEm = new Date().toISOString();
  return { pngPath, meta };
}
