import fs from 'fs';
import path from 'path';
import { generate as codexGenerate } from '../imageBackend';
import { slugify } from '../userStyles';
import { anchorPath } from './store';
import type { Canon, GenJob, GenMeta, Personagem, ProgressEvent } from '../../types';

export interface AnchorOpts {
  serieId: string;
  size?: string;
  quality?: string;
  onProgress?: (e: ProgressEvent) => void;
  signal?: AbortSignal;
  /** Ajuste livre do usuário (tela "Melhorar" da TUI), anexado ao fim do prompt. */
  extra?: string;
}

/**
 * Prompt do CHARACTER SHEET da âncora: estiloDescricao aplicado + trava visual do
 * personagem + corpo inteiro, vista frontal, fundo neutro liso (sem cenário).
 * `extra` (opcional) é um ajuste livre anexado ao fim (usado no "Melhorar").
 */
export function buildAnchorPrompt(canon: Canon, p: Personagem, extra?: string): string {
  const parts: string[] = [];
  if (canon.estiloDescricao?.trim()) parts.push(canon.estiloDescricao.trim());
  parts.push(`Character reference sheet of ${p.nome}: ${p.descricao}.`);
  parts.push(
    'Full body, front view, neutral standing pose, single character centered, plain flat neutral white background, no scenery, no props, no text, clean consistent character design.',
  );
  if (canon.paleta?.trim()) parts.push(`Palette: ${canon.paleta.trim()}.`);
  if (extra?.trim()) parts.push(`Adjustment: ${extra.trim()}.`);
  return parts.join(' ');
}

/**
 * Gera a âncora (character sheet) de um personagem via `images generate` (codex),
 * grava em anchors/<slug>.png e escreve o caminho em `personagem.anchorPng`
 * (mutação — o objeto vem de canon.personagens, então o cânone fica atualizado).
 */
export async function generateAnchor(
  canon: Canon,
  personagem: Personagem,
  opts: AnchorOpts,
): Promise<{ pngPath: string; meta: GenMeta }> {
  const slug = slugify(personagem.nome) || 'personagem';
  const outPath = anchorPath(opts.serieId, slug);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const job: GenJob = {
    id: `anchor-${slug}`,
    styleId: canon.estiloId,
    index: 0,
    prompt: buildAnchorPrompt(canon, personagem, opts.extra),
    mode: 'generate',
    outPath,
  };
  const { pngPath, meta } = await codexGenerate(job, opts.size ?? '2K', opts.quality ?? 'high', opts.onProgress, opts.signal);
  personagem.anchorPng = pngPath;
  return { pngPath, meta };
}
