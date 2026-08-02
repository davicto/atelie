import { resolveGenProvider } from './genProviders';
import { estimateSessionCost } from './cost';
import { publishSession } from './contactSheet';
import { judgeOne, judgePanel } from './judgeProviders';
import { compose } from './promptComposer';
import { buildJobs, totalVersions, type Versions } from './distribute';
import { runPool } from './pool';
import { findStyle } from './userStyles';
import { assertJudgeEnabled, enabledJudgePanel, loadSettings, resolveEnabledGenProvider } from './settings';
import { SessionLogger } from './logger';
import { createSession } from '../state/session';
import { append, ensureSession, iterDir, writeSnapshot } from '../state/manifest';
import type { GenProviderId, JobResult, JudgeSpec, LogEntry, PanelVerdict, ProgressEvent, Session, Settings, Verdict } from '../types';

export interface RunOptions {
  request: string;
  styleIds: string[];
  versionsPerStyle: number;
  /** Versões individuais por estilo; quando ausente, usa `versionsPerStyle` p/ todos. */
  versionsByStyle?: Record<string, number>;
  quality?: string;
  concurrency?: number;
  judgeModel?: string;
  approveThreshold?: number;
  onProgress?: (e: ProgressEvent) => void;
  onLog?: (e: LogEntry) => void;
  signal?: AbortSignal;
  // Aditivo: contexto de melhoria para iterações > 1 (runAuto / continuar).
  improveCtx?: { sugestao_melhoria: string; prompt_sugerido: string; anchor: string };
  editMode?: boolean;
  refPng?: string;
  // v3: overrides opcionais (headless / sessão). Ausentes caem nos settings.
  genProvider?: GenProviderId;
  judgeMode?: 'painel' | 'unico';
  judgePanel?: JudgeSpec[];
  singleJudge?: JudgeSpec;
  avoid?: string;
  size?: string;
  refs?: string[];
}

/** Juiz único efetivo: no caso claude, o modelo vem do campo `judgeModel` (editável na UI). */
function effectiveSingleJudge(s: Settings, opts: RunOptions): JudgeSpec {
  const base = opts.singleJudge ?? s.singleJudge;
  if (base.provider === 'claude') {
    const model = opts.judgeModel || s.judgeModel;
    return { ...base, model };
  }
  return base;
}

/** Julga uma imagem conforme o modo (painel ou único). */
async function judgeForMode(
  s: Settings,
  opts: RunOptions,
  pngPath: string,
  request: string,
  style: { nome: string; desc: string },
  threshold: number,
): Promise<Verdict | PanelVerdict> {
  const mode = opts.judgeMode ?? s.judgeMode;
  if (mode === 'unico') {
    const spec = effectiveSingleJudge(s, opts);
    assertJudgeEnabled(spec, s); // feature-flag: juiz desabilitado → erro claro
    return judgeOne(spec, pngPath, request, style, threshold, opts.signal);
  }
  const panel = enabledJudgePanel(opts.judgePanel ?? s.judgePanel, s);
  if (!panel.length) throw new Error('nenhum juiz habilitado no painel (verifique enabledClis nas configurações)');
  return judgePanel(pngPath, request, style, panel, threshold, opts.signal);
}

export interface IterationResult {
  iteration: number;
  results: JobResult[];
  best?: JobResult;
  durationMs: number;
}

function pickBest(results: JobResult[]): JobResult | undefined {
  let best: JobResult | undefined;
  let bestNota = -Infinity;
  for (const r of results) {
    const nota = r.verdict?.nota;
    if (r.ok && nota != null && nota > bestNota) {
      bestNota = nota;
      best = r;
    }
  }
  return best ?? results.find((r) => r.ok);
}

/**
 * Roda UMA iteração completa (gera → julga → escolhe best) usando `session.iteration`
 * como número da rodada. Monta jobs com buildJobs, compõe prompts (com improveCtx se
 * houver), grava manifest/durações e loga cada passo. Retorna a iteração.
 */
export async function runIteration(session: Session, opts: RunOptions, logger: SessionLogger): Promise<IterationResult> {
  const started = Date.now();
  const s = loadSettings();
  const iteration = session.iteration;
  const concurrency = opts.concurrency ?? s.concurrency;
  const approveThreshold = opts.approveThreshold ?? s.approveThreshold;

  // feature-flag: se o provedor pedido estiver desabilitado, cai num habilitado (default: no-op).
  const genProviderId = resolveEnabledGenProvider(opts.genProvider ?? session.genProvider ?? s.genProvider, s);
  const size = opts.size ?? session.size;
  const avoid = opts.avoid ?? session.avoid;
  const outDir = iterDir(session.id, iteration);
  const versions: Versions = opts.versionsByStyle ?? session.versionsByStyle ?? opts.versionsPerStyle;
  const jobs = buildJobs(opts.styleIds, versions, outDir, { genProvider: genProviderId, size });
  for (const job of jobs) {
    const style = findStyle(job.styleId);
    if (!style) continue;
    job.prompt = compose(opts.request, style, opts.improveCtx, { avoid, size });
    if (opts.editMode && opts.refPng) {
      job.mode = 'edit';
      job.refPng = opts.refPng;
    }
  }
  session.jobs = jobs;
  session.results = [];
  writeSnapshot(session);
  logger.log(
    `iteração ${iteration}: ${jobs.length} imagem(ns) — ${opts.styleIds.length} estilo(s), ` +
      `${concurrency > 0 ? `${concurrency} worker(s)` : 'todos de uma vez'}`,
  );

  // ── Geração ──────────────────────────────────────────────────────────────
  const results: JobResult[] = new Array(jobs.length);
  await runPool(jobs, concurrency, async (job, i) => {
    if (opts.signal?.aborted) return;
    const style = findStyle(job.styleId);
    if (!style) {
      results[i] = { job, ok: false, error: { code: 'unknown_style', message: `estilo "${job.styleId}" não existe` } };
      logger.log(`estilo desconhecido: ${job.styleId}`, 'err');
      return;
    }
    const quality = opts.quality || style.defaults.quality;
    const provider = resolveGenProvider(job.provider ?? genProviderId, job.mode);
    const jobSize = job.size || style.defaults.size;
    logger.log(`gerando ${job.styleId} #${job.index} (${provider.id})…`);
    const jobStart = Date.now();
    try {
      const { pngPath, meta } = await provider.generate(job, {
        size: jobSize,
        quality,
        onProgress: (e) => opts.onProgress?.(e),
        signal: opts.signal,
      });
      results[i] = { job, pngPath, ok: true, meta };
      const durationMs = Date.now() - jobStart;
      logger.log(`ok ${job.styleId} #${job.index} (${(durationMs / 1000).toFixed(1)}s)`, 'ok');
      // append em try próprio: falha de escrita do manifest NÃO deve reverter a geração ok
      // (senão o catch abaixo marcaria a imagem como perdida e abortaria a iteração).
      try {
        append(session.id, { kind: 'generate', iteration, jobId: job.id, styleId: job.styleId, ok: true, pngPath, meta, durationMs, provider: provider.id });
      } catch (e: any) {
        logger.log(`falha ao gravar manifest (geração ok): ${String(e?.message ?? e)}`, 'warn');
      }
    } catch (err: any) {
      const error = { code: err?.code ?? 'error', message: err?.message ?? String(err) };
      results[i] = { job, ok: false, error };
      logger.log(`erro ${job.styleId} #${job.index}: ${error.message}`, 'err');
      try {
        append(session.id, { kind: 'generate', iteration, jobId: job.id, styleId: job.styleId, ok: false, error });
      } catch {
        /* já é caminho de erro — ignora falha de manifest */
      }
    }
  });

  const gathered = results.filter((r): r is JobResult => Boolean(r));
  session.results = gathered;
  writeSnapshot(session);

  // ── Julgamento ───────────────────────────────────────────────────────────
  const idxs = gathered.map((_, i) => i).filter((i) => gathered[i].ok && gathered[i].pngPath);
  await runPool(idxs, concurrency, async (i) => {
    if (opts.signal?.aborted) return;
    const r = gathered[i];
    const style = findStyle(r.job.styleId);
    const styleInfo = style ? { nome: style.nome, desc: style.desc } : { nome: r.job.styleId, desc: '' };
    logger.log(`julgando ${r.job.styleId} #${r.job.index}…`);
    try {
      const verdict = await judgeForMode(s, opts, r.pngPath!, opts.request, styleInfo, approveThreshold);
      gathered[i] = { ...r, verdict };
      const painel = 'painel' in verdict ? verdict.painel.map((p) => ({ label: p.spec.label, nota: p.verdict.nota })) : undefined;
      logger.log(
        `veredito ${r.job.styleId} #${r.job.index}: nota ${verdict.nota ?? '—'} ${verdict.aprovado ? '✓' : '✗'}${painel ? ` [${painel.map((p) => `${p.label} ${p.nota ?? '—'}`).join(', ')}]` : ''}`,
        verdict.aprovado ? 'ok' : 'warn',
      );
      append(session.id, { kind: 'verdict', iteration, jobId: r.job.id, styleId: r.job.styleId, nota: verdict.nota, aprovado: verdict.aprovado, painel });
    } catch (err: any) {
      gathered[i] = {
        ...r,
        verdict: {
          aprovado: false,
          nota: null,
          alinhamento: '(juiz falhou)',
          problemas: [String(err?.message ?? err)],
          sugestao_melhoria: '',
          prompt_sugerido: '',
        },
      };
      logger.log(`juiz falhou em ${r.job.styleId} #${r.job.index}: ${String(err?.message ?? err)}`, 'err');
    }
  });

  const best = pickBest(gathered);
  const durationMs = Date.now() - started;
  session.results = gathered;
  writeSnapshot(session);

  // Publicação AUTOMÁTICA: toda imagem gerada vai para a pasta pública + página.
  try {
    const pub = publishSession(session.id);
    session.pageDir = pub.dir;
    session.pagePath = pub.page;
    writeSnapshot(session);
    logger.log(`página atualizada: ${pub.page} (${pub.images.length} imagem(ns))`, 'ok');
  } catch (e: any) {
    logger.log(`falha ao publicar a página: ${String(e?.message ?? e)}`, 'warn');
  }
  append(session.id, { kind: 'iterate', iteration, durationMs, bestJobId: best?.job.id, bestNota: best?.verdict?.nota ?? null });
  logger.log(
    `iteração ${iteration} concluída em ${(durationMs / 1000).toFixed(1)}s — melhor: ${best ? `${best.job.styleId} nota ${best.verdict?.nota ?? '—'}` : '—'}`,
    'ok',
  );

  return { iteration, results: gathered, best, durationMs };
}

/**
 * Loop automático (headless): roda a 1ª iteração; enquanto o best não for aprovado
 * e restarem rondas, recompõe com o veredito do best (prompt_sugerido/sugestao_melhoria,
 * mantendo a âncora de sujeito) e roda de novo.
 */
export async function runAuto(
  opts: RunOptions & { maxIterations: number },
): Promise<{ session: Session; iterations: IterationResult[]; best?: JobResult }> {
  const versions = opts.versionsPerStyle;
  const total = totalVersions(opts.styleIds, opts.versionsByStyle ?? versions);
  const genProvider: GenProviderId = opts.genProvider ?? loadSettings().genProvider;
  const session = createSession(opts.request, opts.styleIds, total, genProvider, versions);
  session.genProvider = genProvider;
  if (opts.versionsByStyle) session.versionsByStyle = opts.versionsByStyle;
  if (opts.avoid) session.avoid = opts.avoid;
  if (opts.size) session.size = opts.size;
  if (opts.refs?.length) session.refs = opts.refs;
  ensureSession(session);
  const startedAt = Date.now();
  const logger = new SessionLogger(session.id, startedAt, opts.onLog);
  append(session.id, {
    kind: 'session_start',
    request: opts.request,
    styleIds: opts.styleIds,
    versionsPerStyle: versions,
    n: total,
    provider: genProvider,
    genProvider,
    iteration: 1,
  });
  writeSnapshot(session);

  const iterations: IterationResult[] = [];
  let it = await runIteration(session, opts, logger);
  iterations.push(it);
  let best = it.best;

  let extra = 0;
  while (best && !best.verdict?.aprovado && extra < opts.maxIterations) {
    if (opts.signal?.aborted) break;
    extra++;
    session.iteration = session.iteration + 1;
    const improveCtx = {
      sugestao_melhoria: best.verdict?.sugestao_melhoria ?? '',
      prompt_sugerido: best.verdict?.prompt_sugerido ?? '',
      anchor: session.subjectAnchor,
    };
    it = await runIteration(session, { ...opts, improveCtx }, logger);
    iterations.push(it);
    best = it.best;
  }

  const totalDurationMs = Date.now() - startedAt;
  session.totalDurationMs = totalDurationMs;
  session.iterationsMeta = iterations.map((i) => ({ iteration: i.iteration, durationMs: i.durationMs }));
  session.chosen =
    best && best.pngPath
      ? { iteration: it.iteration, jobIndex: best.job.index, styleId: best.job.styleId, pngPath: best.pngPath }
      : undefined;
  session.estimatedCostUsd = estimateSessionCost(session).usd;
  append(session.id, { kind: 'session_end', chosen: session.chosen, totalDurationMs, iterationsMeta: session.iterationsMeta, estimatedCostUsd: session.estimatedCostUsd });
  writeSnapshot(session);
  logger.log(`sessão concluída em ${(totalDurationMs / 1000).toFixed(1)}s`, 'ok');

  return { session, iterations, best };
}

/**
 * Re-julga uma imagem existente conforme o `judgeMode` vigente. Em modo 'unico'
 * com juiz claude, `judgeModel` sobrepõe o modelo (compat com a chamada do v2).
 */
export async function reJudge(
  pngPath: string,
  request: string,
  style: { nome: string; desc: string },
  judgeModel: string,
): Promise<Verdict | PanelVerdict> {
  const s = loadSettings();
  return judgeForMode(s, { request, styleIds: [], versionsPerStyle: 0, judgeModel }, pngPath, request, style, s.approveThreshold);
}
