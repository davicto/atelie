import fs from 'fs';
import { cliEnabled, loadSettings } from '../settings';
import { permiteEncadear, runPool } from '../pool';
import { styleLock } from '../userStyles';
import { draftCanon } from './canon';
import { generateAnchor } from './anchor';
import { generatePanel, type PanelOpts } from './panel';
import { appendSerie, createSerie, ensureSerie, saveSerie } from './store';
import type { Canon, JudgeSpec, Personagem, Painel, ProgressEvent, Serie } from '../../types';

/** Formato do `--spec` (serie.json) consumido headless. */
export interface SerieSpec {
  titulo: string;
  estilo?: string;
  desc?: string;
  canon?: {
    estiloDescricao?: string;
    /**
     * `anchorPng` (opcional) reaproveita um sprite JÁ validado — tipicamente o do
     * elenco de um projeto. Personagem que chega com âncora existente não é
     * regerado, então a validação feita na tela do projeto vale para a série.
     */
    personagens?: Array<{ nome: string; descricao: string; anchorPng?: string }>;
    paleta?: string;
    mundo?: string;
  };
  paineis: Array<{ cena: string; personagens?: string[] }>;
  /** Projeto dono desta série (só rastreio; a série continua vivendo em ~/.atelie/series). */
  projectId?: string;
}

export interface RunSerieOpts {
  size?: string;
  quality?: string;
  consistThreshold?: number;
  cenaThreshold?: number;
  maxTentativas?: number;
  incluirAnterior?: boolean;
  /**
   * Imagens simultâneas no codex. 0 = ilimitado (default do app). Vale para as
   * âncoras e para os painéis. Só `1` preserva o encadeamento painel N → N-1;
   * qualquer outro valor o desliga (ver `permiteEncadear`).
   */
  concurrency?: number;
  judgeSpec?: JudgeSpec;
  canonModel?: string;
  onProgress?: (e: ProgressEvent) => void;
  onLog?: (msg: string) => void;
  signal?: AbortSignal;
  /** Repassado a generatePanel: dispara a cada tentativa, com a imagem ainda viva. */
  onAttempt?: PanelOpts['onAttempt'];
  /**
   * Disparado assim que a série ganha id e é persistida, ANTES de qualquer
   * geração. Permite ao chamador ligá-la ao projeto já no início, para que um run
   * interrompido não deixe as imagens órfãs.
   */
  onSerieCreated?: (s: Serie) => void;
}

function canonFromSpec(c: NonNullable<SerieSpec['canon']>, estiloId: string, fallbackDesc: string): Canon {
  const personagens: Personagem[] = (c.personagens ?? [])
    .filter((x) => x && typeof x === 'object')
    .map((x) => ({
      nome: String(x.nome ?? '').trim() || 'Personagem',
      descricao: String(x.descricao ?? '').trim(),
      // Sprite já validado: vira âncora direto (o loop abaixo pula a regeração).
      ...(typeof x.anchorPng === 'string' && x.anchorPng && fs.existsSync(x.anchorPng) ? { anchorPng: x.anchorPng } : {}),
    }));
  // Trava de estilo = template do estilo (inglês, com luz/paleta/restrições). O `desc`
  // — uma frase em pt-BR — não segura linha nem paleta entre painéis.
  const estiloDescricao =
    c.estiloDescricao?.trim() || styleLock(estiloId) || fallbackDesc.slice(0, 200).trim();
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
  if (spec.projectId) serie.projectId = spec.projectId;
  ensureSerie(serie);
  appendSerie(serie.id, { kind: 'serie_start', titulo: spec.titulo, estilo: estiloId, personagens: canon.personagens.map((p) => p.nome) });
  saveSerie(serie);
  opts.onSerieCreated?.(serie);

  const concurrency = Math.max(0, Math.round(opts.concurrency ?? s.concurrency));
  const emParalelo = !permiteEncadear(concurrency);
  const largura = concurrency > 0 ? `${concurrency} por vez` : 'todas de uma vez';

  // ── Âncoras (uma por personagem; independentes entre si) ──────────────────
  const pendentes = canon.personagens.filter((p) => {
    // Já veio com âncora validada (sprite do projeto) → não regera nem gasta imagem.
    if (p.anchorPng && fs.existsSync(p.anchorPng)) {
      opts.onLog?.(`âncora: ${p.nome} — reaproveitando sprite validado`);
      appendSerie(serie.id, { kind: 'anchor', nome: p.nome, anchorPng: p.anchorPng, reaproveitado: true });
      return false;
    }
    return true;
  });
  saveSerie(serie);
  if (pendentes.length > 1) opts.onLog?.(`âncoras: ${pendentes.length} a gerar (${largura})`);
  await runPool(pendentes, concurrency, async (p) => {
    if (opts.signal?.aborted) return;
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
  });

  // ── Painéis ───────────────────────────────────────────────────────────────
  // A lista inteira entra em serie.paineis ANTES do pool: com painéis correndo
  // juntos, um push por tarefa embaralharia a ordem dos quadros.
  const paineis: Painel[] = (spec.paineis ?? []).map((ps, i) => ({
    n: i + 1,
    cena: ps.cena,
    personagens: ps.personagens?.length ? ps.personagens : canon.personagens.map((c) => c.nome),
  }));
  serie.paineis.push(...paineis);
  saveSerie(serie);

  // Encadear o painel N ao N-1 exige sequência: em paralelo o anterior ainda não
  // existe. Quem pediu paralelismo abre mão do encadeamento — e é avisado.
  const incluirAnterior = emParalelo ? false : (opts.incluirAnterior ?? s.incluirAnterior);
  if (paineis.length > 1) {
    opts.onLog?.(
      emParalelo
        ? `painéis: ${paineis.length} (${largura}) — sem referência ao painel anterior, incompatível com paralelismo`
        : `painéis: ${paineis.length} (um por vez${opts.incluirAnterior ?? s.incluirAnterior ? ', encadeados ao anterior' : ''})`,
    );
  }

  await runPool(paineis, concurrency, async (painel) => {
    if (opts.signal?.aborted) return;
    await generatePanel(serie, painel, {
      consistThreshold: opts.consistThreshold ?? s.consistThreshold,
      cenaThreshold: opts.cenaThreshold ?? s.cenaThreshold,
      maxTentativas: opts.maxTentativas ?? s.maxTentativas,
      incluirAnterior,
      judgeSpec: opts.judgeSpec ?? s.serieJudge,
      size: opts.size,
      quality: opts.quality,
      onProgress: opts.onProgress,
      onLog: opts.onLog,
      signal: opts.signal,
      onAttempt: opts.onAttempt,
    });
    saveSerie(serie);
  });

  appendSerie(serie.id, { kind: 'serie_end', paineis: serie.paineis.length, aprovados: serie.paineis.filter((p) => p.aprovado).length });
  saveSerie(serie);
  return serie;
}
