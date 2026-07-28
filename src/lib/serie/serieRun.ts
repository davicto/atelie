import { cliEnabled, loadSettings } from '../settings';
import { findStyle } from '../userStyles';
import { draftCanon } from './canon';
import { generateAnchor } from './anchor';
import { generatePanel } from './panel';
import { appendSerie, createSerie, ensureSerie, saveSerie } from './store';
import type { Canon, JudgeSpec, Personagem, Painel, ProgressEvent, Serie } from '../../types';

/** Formato do `--spec` (serie.json) consumido headless. */
export interface SerieSpec {
  titulo: string;
  estilo?: string;
  desc?: string;
  canon?: {
    estiloDescricao?: string;
    personagens?: Array<{ nome: string; descricao: string }>;
    paleta?: string;
    mundo?: string;
  };
  paineis: Array<{ cena: string; personagens?: string[] }>;
}

export interface RunSerieOpts {
  size?: string;
  quality?: string;
  consistThreshold?: number;
  cenaThreshold?: number;
  maxTentativas?: number;
  incluirAnterior?: boolean;
  judgeSpec?: JudgeSpec;
  canonModel?: string;
  onProgress?: (e: ProgressEvent) => void;
  onLog?: (msg: string) => void;
  signal?: AbortSignal;
}

function canonFromSpec(c: NonNullable<SerieSpec['canon']>, estiloId: string, fallbackDesc: string): Canon {
  const personagens: Personagem[] = (c.personagens ?? [])
    .filter((x) => x && typeof x === 'object')
    .map((x) => ({ nome: String(x.nome ?? '').trim() || 'Personagem', descricao: String(x.descricao ?? '').trim() }));
  const estiloDescricao =
    c.estiloDescricao?.trim() || findStyle(estiloId)?.desc || fallbackDesc.slice(0, 200).trim();
  return {
    estiloId: estiloId || 'custom',
    estiloDescricao,
    personagens,
    paleta: c.paleta?.trim() || undefined,
    mundo: c.mundo?.trim() || undefined,
  };
}

/**
 * Roda uma série INTEIRA headless: (1) monta o cânone — do spec.canon pronto ou via
 * draftCanon(spec.desc) — (2) gera a âncora de cada personagem, (3) gera cada painel
 * em SEQUÊNCIA (a ordem importa: o painel N pode referenciar N-1). Persiste tudo.
 */
export async function runSerie(spec: SerieSpec, opts: RunSerieOpts = {}): Promise<Serie> {
  const s = loadSettings();
  const estiloId = spec.estilo || 'custom';

  // Feature-flags: a Série gera SEMPRE via codex (edit multi-ref); o juiz de coerência usa serieJudge.
  if (!cliEnabled('codex', s)) throw new Error('CLI codex está desabilitada nas configurações — a modalidade Série exige codex para geração.');
  const serieJudge = opts.judgeSpec ?? s.serieJudge;
  if (!cliEnabled(serieJudge.provider, s)) throw new Error(`CLI ${serieJudge.provider} (juiz de consistência da série) está desabilitada nas configurações.`);

  let canon: Canon;
  if (spec.canon && (spec.canon.personagens?.length || spec.canon.estiloDescricao)) {
    canon = canonFromSpec(spec.canon, estiloId, spec.desc ?? spec.titulo);
  } else if (spec.desc) {
    if (!cliEnabled('claude', s)) throw new Error('CLI claude está desabilitada — necessária para montar o cânone (forneça spec.canon com personagens para dispensá-la).');
    opts.onLog?.('montando o cânone (Claude)…');
    canon = await draftCanon(spec.desc, estiloId, { model: opts.canonModel });
  } else {
    throw new Error('spec da série precisa de `canon` (com personagens) ou `desc` para o draftCanon');
  }
  if (!canon.personagens.length) throw new Error('cânone sem personagens — nada para ancorar');

  const request = spec.desc ?? spec.titulo;
  const serie = createSerie(spec.titulo, request, canon);
  ensureSerie(serie);
  appendSerie(serie.id, { kind: 'serie_start', titulo: spec.titulo, estilo: estiloId, personagens: canon.personagens.map((p) => p.nome) });
  saveSerie(serie);

  // ── Âncoras (uma por personagem) ──────────────────────────────────────────
  for (const p of canon.personagens) {
    if (opts.signal?.aborted) break;
    opts.onLog?.(`âncora: ${p.nome}…`);
    await generateAnchor(canon, p, {
      serieId: serie.id,
      size: opts.size,
      quality: opts.quality,
      onProgress: opts.onProgress,
      signal: opts.signal,
    });
    appendSerie(serie.id, { kind: 'anchor', nome: p.nome, anchorPng: p.anchorPng });
    saveSerie(serie);
  }

  // ── Painéis (em sequência) ────────────────────────────────────────────────
  let n = 1;
  for (const ps of spec.paineis ?? []) {
    if (opts.signal?.aborted) break;
    const personagens = ps.personagens?.length ? ps.personagens : canon.personagens.map((c) => c.nome);
    const painel: Painel = { n, cena: ps.cena, personagens };
    serie.paineis.push(painel);
    await generatePanel(serie, painel, {
      consistThreshold: opts.consistThreshold ?? s.consistThreshold,
      cenaThreshold: opts.cenaThreshold ?? s.cenaThreshold,
      maxTentativas: opts.maxTentativas ?? s.maxTentativas,
      incluirAnterior: opts.incluirAnterior ?? s.incluirAnterior,
      judgeSpec: opts.judgeSpec ?? s.serieJudge,
      size: opts.size,
      quality: opts.quality,
      onProgress: opts.onProgress,
      onLog: opts.onLog,
      signal: opts.signal,
    });
    saveSerie(serie);
    n++;
  }

  appendSerie(serie.id, { kind: 'serie_end', paineis: serie.paineis.length, aprovados: serie.paineis.filter((p) => p.aprovado).length });
  saveSerie(serie);
  return serie;
}
