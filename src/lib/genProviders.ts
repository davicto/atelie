import { generate as codexGenerate } from './imageBackend';
import type { GenGenOpts, GenJob, GenMeta, GenProviderId } from '../types';

export type { GenProviderId, GenGenOpts } from '../types';

export interface GenProvider {
  id: GenProviderId;
  label: string;
  /** Gera (grava em `job.outPath`) e devolve o caminho REAL + meta. */
  generate(job: GenJob, opts: GenGenOpts): Promise<{ pngPath: string; meta: GenMeta }>;
  supportsEdit: boolean;
  supportsTransparent: boolean;
}

/** Único provedor de geração: Codex/gpt-image-2 (suporta edit e transparência). */
export const codexProvider: GenProvider = {
  id: 'codex',
  label: 'Codex (gpt-image-2)',
  supportsEdit: true,
  supportsTransparent: true,
  generate: (job, opts) => codexGenerate(job, opts.size, opts.quality, opts.onProgress, opts.signal),
};

export const GEN_PROVIDERS: Record<GenProviderId, GenProvider> = { codex: codexProvider };

/** Resolve o provedor por id; qualquer valor cai em `codex` (é o único). */
export function getGenProvider(_id?: GenProviderId | string): GenProvider {
  return codexProvider;
}

/** Mantido por compat de assinatura: todo modo (generate/edit/transparent) roda no codex. */
export function resolveGenProvider(_id?: GenProviderId | string, _mode?: GenJob['mode']): GenProvider {
  return codexProvider;
}
