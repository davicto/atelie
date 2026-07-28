import path from 'path';
import type { GenJob, GenProviderId } from '../types';
import { findStyle } from './userStyles';

function jobMode(styleId: string): GenJob['mode'] {
  const style = findStyle(styleId);
  return style?.defaults.background === 'transparent' ? 'transparent' : 'generate';
}

/**
 * Distribui N imagens entre os estilos escolhidos em round-robin. O nome do
 * arquivo usa o índice GLOBAL i (evita colisão quando o mesmo estilo repete).
 * Mantido por compat; o fluxo v2 usa `buildJobs`.
 */
export function roundRobin(styleIds: string[], n: number, outDir: string): GenJob[] {
  const jobs: GenJob[] = [];
  for (let i = 0; i < n; i++) {
    const styleId = styleIds[i % styleIds.length];
    const id = `${styleId}-${i}`;
    jobs.push({
      id,
      styleId,
      index: i,
      prompt: '', // preenchido pelo chamador via promptComposer.compose
      mode: jobMode(styleId),
      outPath: path.join(outDir, `${id}.png`),
    });
  }
  return jobs;
}

/** Versões pedidas: número único (todos os estilos) ou mapa `{styleId: n}`. */
export type Versions = number | Record<string, number>;

/** Quantas versões um estilo pede (mapa tem precedência; default 1). */
export function versionsOf(versions: Versions, styleId: string): number {
  if (typeof versions === 'number') return Math.max(0, Math.round(versions));
  const v = versions?.[styleId];
  return Number.isFinite(v) ? Math.max(0, Math.round(v as number)) : 1;
}

/** Total de imagens de um pedido (soma das versões de cada estilo). */
export function totalVersions(styleIds: string[], versions: Versions): number {
  return styleIds.reduce((a, id) => a + versionsOf(versions, id), 0);
}

/**
 * Constrói os jobs de CADA estilo conforme `versions` — um número (igual para
 * todos) ou um mapa `{styleId: n}` (quantidade individual por estilo).
 * Índice global crescente; id `${styleId}-${index}`; mode 'transparent' quando
 * o estilo tem background transparente. `opts` fixa o provedor de geração e a
 * dimensão pedida por job; ambos opcionais (caem nos defaults na pipeline).
 */
export function buildJobs(
  styleIds: string[],
  versions: Versions,
  outDir: string,
  opts?: { genProvider?: GenProviderId; size?: string },
): GenJob[] {
  const jobs: GenJob[] = [];
  let index = 0;
  for (const styleId of styleIds) {
    const n = versionsOf(versions, styleId);
    for (let v = 0; v < n; v++) {
      const id = `${styleId}-${index}`;
      jobs.push({
        id,
        styleId,
        index,
        prompt: '', // preenchido pelo chamador via promptComposer.compose
        mode: jobMode(styleId),
        outPath: path.join(outDir, `${id}.png`),
        provider: opts?.genProvider,
        size: opts?.size,
      });
      index++;
    }
  }
  return jobs;
}
