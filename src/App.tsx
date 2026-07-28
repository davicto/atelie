import React, { useEffect, useRef, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { theme } from './theme';
import { loadSettings } from './lib/settings';
import type { Canon, GenJob, GenProviderId, JobResult, LogEntry, ProgressEvent, Screen, Serie, Session, Settings } from './types';
import { getAllStyles, findStyle } from './lib/userStyles';
import { authInspect, doctor } from './lib/imageBackend';
import { runIteration, reJudge, type RunOptions } from './lib/pipeline';
import { buildJobs } from './lib/distribute';
import { createSession } from './state/session';
import { append, ensureSession, iterDir, sessionDir, writeSnapshot } from './state/manifest';
import { SessionLogger } from './lib/logger';
import { openFolder, openViewer } from './lib/viewer';
import { estimateSessionCost } from './lib/cost';
import { buildContactSheet, publishSession } from './lib/contactSheet';
import { Banner } from './components/Banner';
import { StatusBar } from './components/StatusBar';
import { Messages } from './components/Messages';
import { MainMenu, type MenuItem } from './components/MainMenu';
import { ComposePanel, type ComposeValue } from './components/ComposePanel';
import { ProgressPanel } from './components/ProgressPanel';
import { LogPanel } from './components/LogPanel';
import { Timer } from './components/Timer';
import { VerdictGrid } from './components/VerdictGrid';
import { ImprovePrompt } from './components/ImprovePrompt';
import { PromptView } from './components/PromptView';
import { ConfigScreen } from './components/ConfigScreen';
import { AddStyleScreen } from './components/AddStyleScreen';
import { SessionsScreen } from './components/SessionsScreen';
import { SessionDetail } from './components/SessionDetail';
import { SerieMenu } from './components/serie/SerieMenu';
import { SerieNew } from './components/serie/SerieNew';
import { SerieAnchors } from './components/serie/SerieAnchors';
import { SeriePanels } from './components/serie/SeriePanels';
import { SerieView } from './components/serie/SerieView';
import { anchorsComplete, appendSerie, createSerie, ensureSerie, loadSerie, saveSerie } from './lib/serie/store';

type Prog = { percent: number; phase: string; message: string };
type ProgMap = Record<string, Prog>;

const HINTS: Partial<Record<Screen, string>> = {
  bootstrap: 'preparando runtime…',
  menu: '↑↓ move · Enter seleciona · Ctrl+C sai',
  compose: 'Tab/⇥ próxima coluna · ⇧Tab volta · ↑↓ move · espaço marca · Enter avança/gera · Esc cancela',
  generating: 'q cancela · Ctrl+C sai',
  review: '↑↓ move · o/v ver · p prompt · r reavaliar · g página · d pasta · Enter melhorar · q menu',
  improve_question: 's/n · depois g/e · Esc volta',
  prompt_view: 'Esc/q volta',
  sessions: '↑↓ move · Enter abre · q volta',
  session_detail: '↑↓ img · o/p/l · c continuar · r reavaliar · q volta',
  add_style: '↑↓ campo · Enter avança/gera · Esc cancela',
  config: '↑↓ campo · ←→ ajusta · Enter edita · s salva · Esc cancela',
  serie_menu: '↑↓ move · Enter abre/nova · q volta',
  serie_new: '↑↓/Enter edita · c confirma · r regenera · Esc cancela',
  serie_anchors: 'g gera · v ver · a aceitar · m melhorar · Enter avança · q volta',
  serie_panels: 'a painel · s galeria · o/v ver · a/m/r na review · q volta',
  serie_view: 'g galeria · Enter/q volta',
  done: 'g página · d pasta · Enter/q volta ao menu · Ctrl+C sai',
  fatal: 'Enter/q continua',
};

function pickBestIndex(results: JobResult[]): number {
  let bi = -1;
  let bn = -Infinity;
  results.forEach((r, i) => {
    const n = r.verdict?.nota;
    if (r.ok && n != null && n > bn) {
      bn = n;
      bi = i;
    }
  });
  if (bi < 0) bi = results.findIndex((r) => r.ok);
  return bi;
}

export default function App() {
  const { exit } = useApp();

  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [screen, setScreen] = useState<Screen>('bootstrap');
  const [session, setSession] = useState<Session | null>(null);
  const [provider, setProvider] = useState('');

  // Criar: um painel único de colunas devolve TODAS as escolhas de uma vez.
  const [request, setRequest] = useState('');
  const [styleIds, setStyleIds] = useState<string[]>([]);
  const [compose, setCompose] = useState<ComposeValue | null>(null);
  const [notice, setNotice] = useState('');

  // Geração/julgamento ao vivo
  const [workingJobs, setWorkingJobs] = useState<GenJob[]>([]);
  const [progress, setProgress] = useState<ProgMap>({});
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [workStartedAt, setWorkStartedAt] = useState(0);
  const [working, setWorking] = useState(false);

  // Review
  const [bestIndex, setBestIndex] = useState(-1);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [busy, setBusy] = useState(false);

  // prompt_view / diversos
  const [promptView, setPromptView] = useState<{ title: string; prompt: string; suggested?: string }>({ title: '', prompt: '' });
  const [detailId, setDetailId] = useState('');
  const [fatalLines, setFatalLines] = useState<string[]>([]);

  // Série (modalidade de coerência entre múltiplas imagens)
  const [serie, setSerie] = useState<Serie | null>(null);

  const sessionRef = useRef<Session | null>(null);
  const cancelledRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const improveTargetRef = useRef(0);
  const promptReturnRef = useRef<Screen>('review');

  function commitSession(next: Session): void {
    sessionRef.current = next;
    setSession(next);
  }

  function quit(): void {
    cancelledRef.current = true;
    abortRef.current?.abort();
    try {
      exit();
    } catch {
      /* ignore */
    }
    process.exit(0);
  }

  function returnToMenu(): void {
    setScreen('menu');
  }

  // ── Bootstrap: doctor + auth ────────────────────────────────────────────
  useEffect(() => {
    void (async () => {
      try {
        const [d, a] = await Promise.all([doctor(), authInspect()]);
        if (!d.ok) {
          setFatalLines([
            'Runtime de geração indisponível (doctor falhou).',
            'Verifique o wrapper do gpt-image-2-skill ou defina GPT_IMAGE_2_SKILL_BIN.',
            'Se for auth, rode: codex login',
          ]);
          setScreen('fatal');
          return;
        }
        if (!a.codexReady) {
          setFatalLines(['Auth do Codex ausente.', 'Rode: codex login', 'Depois reabra o Ateliê.']);
          setScreen('fatal');
          return;
        }
        setProvider(d.resolved || 'codex');
        setScreen('menu');
      } catch (err: any) {
        setFatalLines(['Falha inesperada no bootstrap:', String(err?.message ?? err)]);
        setScreen('fatal');
      }
    })();
  }, []);

  // ── Motor: roda UMA iteração (gera+julga) com log/cronômetro ao vivo ─────
  async function runWorking(
    sess: Session,
    opts: {
      request: string;
      styleIds: string[];
      versionsPerStyle: number;
      versionsByStyle?: Record<string, number>;
      quality?: string;
      improveCtx?: { sugestao_melhoria: string; prompt_sugerido: string; anchor: string };
      editMode?: boolean;
      refPng?: string;
    },
  ): Promise<void> {
    cancelledRef.current = false;
    const controller = new AbortController();
    abortRef.current = controller;
    const started = Date.now();

    // Pré-computa os jobs para exibir as barras já no início; os ids são
    // determinísticos (`${styleId}-${index}`) e casam com os que runIteration
    // reconstrói, então os eventos de progresso mapeiam certo.
    const outDir = iterDir(sess.id, sess.iteration);
    const displayJobs = buildJobs(opts.styleIds, opts.versionsByStyle ?? opts.versionsPerStyle, outDir);
    setWorkingJobs(displayJobs);
    setProgress(Object.fromEntries(displayJobs.map((j) => [j.id, { percent: 0, phase: 'fila', message: '' }])));
    setLogs([]);
    setNotice('');
    setWorkStartedAt(started);
    setWorking(true);
    setScreen('generating');

    const logger = new SessionLogger(sess.id, started, (e) => setLogs((prev) => [...prev, e]));
    const runOpts: RunOptions = {
      request: opts.request,
      styleIds: opts.styleIds,
      versionsPerStyle: opts.versionsPerStyle,
      versionsByStyle: opts.versionsByStyle,
      quality: opts.quality,
      concurrency: compose?.workers ?? settings.concurrency,
      judgeMode: (compose?.judges.length ?? 0) > 1 ? 'painel' : 'unico',
      judgePanel: compose?.judges,
      singleJudge: compose?.judges[0],
      avoid: compose?.avoid || undefined,
      size: compose?.size,
      signal: controller.signal,
      onProgress: (e: ProgressEvent) =>
        setProgress((prev) => ({ ...prev, [e.jobId]: { percent: e.percent, phase: e.phase, message: e.message } })),
      improveCtx: opts.improveCtx,
      editMode: opts.editMode,
      refPng: opts.refPng,
    };

    try {
      const it = await runIteration(sess, runOpts, logger);
      sess.iterationsMeta = [...(sess.iterationsMeta ?? []), { iteration: it.iteration, durationMs: it.durationMs }];
      writeSnapshot(sess);
      commitSession({ ...sess });
      setWorking(false);
      if (cancelledRef.current) {
        returnToMenu();
        return;
      }
      // A pipeline já publicou tudo (pageDir); abre a pasta assim que a rodada
      // termina — não espera o encerramento da sessão nem a tecla 'd'.
      if (settings.autoOpenFolder && sess.pageDir) {
        openFolder(sess.pageDir);
        setNotice(`pasta: ${sess.pageDir}`);
      }
      const bi = pickBestIndex(it.results);
      setBestIndex(bi);
      setSelectedIndex(bi >= 0 ? bi : 0);
      setScreen('review');
    } catch (err: any) {
      setWorking(false);
      setFatalLines(['Falha na esteira:', String(err?.message ?? err)]);
      setScreen('fatal');
    }
  }

  // ── Criar: transições ───────────────────────────────────────────────────
  function startCreate(): void {
    setCompose(null);
    setRequest('');
    setStyleIds([]);
    setScreen('compose');
  }

  /** O painel de colunas devolveu tudo: cria a sessão e dispara a esteira. */
  function handleCompose(v: ComposeValue): void {
    setCompose(v);
    setRequest(v.request);
    setStyleIds(v.styleIds);
    const refs = v.refs.split(',').map((s) => s.trim()).filter(Boolean);
    const maxVersions = Math.max(1, ...v.styleIds.map((id) => v.versionsByStyle[id] ?? 1));
    const total = v.styleIds.reduce((a, id) => a + (v.versionsByStyle[id] ?? 1), 0);
    const sess = createSession(v.request, v.styleIds, total, 'codex', maxVersions);
    sess.genProvider = 'codex';
    sess.versionsByStyle = v.versionsByStyle;
    if (v.size) sess.size = v.size;
    if (refs.length) sess.refs = refs;
    if (v.avoid) sess.avoid = v.avoid;
    ensureSession(sess);
    append(sess.id, {
      kind: 'session_start',
      request: v.request,
      styleIds: v.styleIds,
      versionsPerStyle: maxVersions,
      versionsByStyle: v.versionsByStyle,
      n: total,
      provider: 'codex',
      genProvider: 'codex',
      size: v.size,
      refs,
      avoid: v.avoid,
      workers: v.workers,
      judges: v.judges.map((j) => j.label),
      iteration: 1,
    });
    writeSnapshot(sess);
    commitSession(sess);
    void runWorking(sess, {
      request: v.request,
      styleIds: v.styleIds,
      versionsPerStyle: maxVersions,
      versionsByStyle: v.versionsByStyle,
      quality: settings.defaultQuality,
      editMode: refs.length > 0,
      refPng: refs[0],
    });
  }

  // ── Melhorar / Continuar ────────────────────────────────────────────────
  function handleImproveDecide(d: { improve: boolean; mode: 'generate' | 'edit' }): void {
    if (!d.improve) {
      finishDone();
      return;
    }
    const sess = sessionRef.current;
    if (!sess) {
      finishDone();
      return;
    }
    const target = sess.results[improveTargetRef.current];
    const ctx = target?.verdict
      ? { sugestao_melhoria: target.verdict.sugestao_melhoria, prompt_sugerido: target.verdict.prompt_sugerido, anchor: sess.subjectAnchor }
      : undefined;
    const next: Session = { ...sess, iteration: sess.iteration + 1 };
    commitSession(next);
    void runWorking(next, {
      request: next.request,
      styleIds: next.styleIds,
      versionsPerStyle: next.versionsPerStyle,
      versionsByStyle: next.versionsByStyle,
      quality: settings.defaultQuality,
      improveCtx: ctx,
      editMode: d.mode === 'edit',
      refPng: target?.pngPath,
    });
  }

  function continueSession(sess: Session): void {
    const next: Session = { ...sess, iteration: (sess.iteration ?? 1) + 1 };
    setRequest(next.request);
    setStyleIds(next.styleIds);
    commitSession(next);
    const bi = pickBestIndex(next.results ?? []);
    const best = bi >= 0 ? next.results[bi] : undefined;
    const ctx = best?.verdict
      ? { sugestao_melhoria: best.verdict.sugestao_melhoria, prompt_sugerido: best.verdict.prompt_sugerido, anchor: next.subjectAnchor }
      : undefined;
    void runWorking(next, {
      request: next.request,
      styleIds: next.styleIds,
      versionsPerStyle: next.versionsPerStyle,
      versionsByStyle: next.versionsByStyle,
      quality: settings.defaultQuality,
      improveCtx: ctx,
    });
  }

  // ── Reavaliar (review) ──────────────────────────────────────────────────
  async function doReJudge(idx: number): Promise<void> {
    const sess = sessionRef.current;
    if (!sess) return;
    const r = sess.results[idx];
    if (!r?.ok || !r.pngPath) return;
    setBusy(true);
    const style = findStyle(r.job.styleId);
    const info = style ? { nome: style.nome, desc: style.desc } : { nome: r.job.styleId, desc: '' };
    const logger = new SessionLogger(sess.id, Date.now());
    logger.log(`reavaliando ${r.job.styleId} #${r.job.index}…`);
    try {
      const verdict = await reJudge(r.pngPath, sess.request, info, settings.judgeModel);
      const results = sess.results.slice();
      results[idx] = { ...r, verdict };
      logger.log(
        `novo veredito ${r.job.styleId} #${r.job.index}: nota ${verdict.nota ?? '—'} ${verdict.aprovado ? '✓' : '✗'}`,
        verdict.aprovado ? 'ok' : 'warn',
      );
      append(sess.id, { kind: 'verdict', iteration: sess.iteration, jobId: r.job.id, styleId: r.job.styleId, nota: verdict.nota, aprovado: verdict.aprovado });
      const next: Session = { ...sess, results };
      writeSnapshot(next);
      commitSession(next);
      setBestIndex(pickBestIndex(results));
    } catch (e: any) {
      logger.log(`falha ao reavaliar: ${String(e?.message ?? e)}`, 'err');
    }
    setBusy(false);
  }

  function openPromptView(): void {
    const r = sessionRef.current?.results[selectedIndex];
    if (!r) return;
    setPromptView({
      title: `Prompt — ${findStyle(r.job.styleId)?.nome ?? r.job.styleId} v${r.job.index}`,
      prompt: r.job.prompt,
      suggested: r.verdict?.prompt_sugerido,
    });
    promptReturnRef.current = 'review';
    setScreen('prompt_view');
  }

  // ── Página / pasta (tudo é publicado; não há favoritar-para-exportar) ─────
  /** Republica e abre a página com TODAS as imagens da sessão. */
  function doGallery(): void {
    const sess = sessionRef.current;
    if (!sess) return;
    try {
      const pub = publishSession(sess.id);
      commitSession({ ...sess, pageDir: pub.dir, pagePath: pub.page });
      openViewer(pub.page);
      setNotice(`página: ${pub.page}`);
    } catch (e: any) {
      setNotice(`falha na página: ${String(e?.message ?? e)}`);
    }
  }

  /** Abre a pasta onde as imagens ficaram salvas. */
  function doOpenFolder(): void {
    const sess = sessionRef.current;
    if (!sess) return;
    try {
      const dir = sess.pageDir ?? publishSession(sess.id).dir;
      openFolder(dir);
      setNotice(`pasta: ${dir}`);
    } catch (e: any) {
      setNotice(`falha ao abrir a pasta: ${String(e?.message ?? e)}`);
    }
  }

  // ── Encerramento ────────────────────────────────────────────────────────
  function finishDone(): void {
    const sess = sessionRef.current;
    if (!sess) {
      setScreen('done');
      return;
    }
    const best = bestIndex >= 0 ? sess.results[bestIndex] : undefined;
    const chosen =
      best && best.pngPath
        ? { iteration: sess.iteration, jobIndex: best.job.index, styleId: best.job.styleId, pngPath: best.pngPath }
        : undefined;
    const total = sess.iterationsMeta?.reduce((a, m) => a + m.durationMs, 0) ?? sess.totalDurationMs;
    const estimatedCostUsd = estimateSessionCost(sess).usd;
    const next: Session = { ...sess, chosen, totalDurationMs: total, estimatedCostUsd };
    append(sess.id, { kind: 'session_end', chosen, totalDurationMs: total, estimatedCostUsd });
    writeSnapshot(next);
    // Publica tudo e abre a pasta das imagens — sempre, sem depender de favorito.
    try {
      const pub = publishSession(next.id);
      next.pageDir = pub.dir;
      next.pagePath = pub.page;
      writeSnapshot(next);
      if (settings.autoOpenFolder) openFolder(pub.dir);
      setNotice(`${pub.images.length} imagem(ns) em ${pub.dir}`);
    } catch (e: any) {
      setNotice(`falha ao publicar: ${String(e?.message ?? e)}`);
    }
    commitSession(next);
    setScreen('done');
  }

  // ── Input global (só das telas que o App renderiza diretamente) ──────────
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      quit();
      return;
    }
    if (screen === 'generating') {
      if (input === 'q') {
        cancelledRef.current = true;
        abortRef.current?.abort();
      }
      return;
    }
    if (screen === 'review') {
      if (busy) return;
      const results = sessionRef.current?.results ?? [];
      if (!results.length) {
        if (input === 'q') returnToMenu();
        return;
      }
      if (key.upArrow || input === 'k') setSelectedIndex((i) => (i - 1 + results.length) % results.length);
      else if (key.downArrow || input === 'j') setSelectedIndex((i) => (i + 1) % results.length);
      else if (input === 'o' || input === 'v') {
        const r = results[selectedIndex];
        if (r?.pngPath) openViewer(r.pngPath);
      } else if (input === 'p') openPromptView();
      else if (input === 'r') void doReJudge(selectedIndex);
      else if (input === 'g') doGallery();
      else if (input === 'd') doOpenFolder();
      else if (key.return) {
        improveTargetRef.current = selectedIndex;
        setScreen('improve_question');
      } else if (input === 'q') returnToMenu();
      return;
    }
    if (screen === 'prompt_view') {
      if (key.escape || input === 'q') setScreen(promptReturnRef.current);
      return;
    }
    if (screen === 'done') {
      if (input === 'g') doGallery();
      else if (input === 'd') doOpenFolder();
      else if (key.return || input === 'q') returnToMenu();
      return;
    }
    if (screen === 'fatal') {
      if (key.return || input === 'q') {
        if (sessionRef.current) returnToMenu();
        else quit();
      }
      return;
    }
  });

  // ── Série ─────────────────────────────────────────────────────────────────
  function refreshSerie(next: Serie): void {
    setSerie({ ...next });
  }

  function openSerie(id: string): void {
    const s = loadSerie(id);
    if (!s) {
      setFatalLines(['Série não encontrada ou ilegível.', id]);
      setScreen('fatal');
      return;
    }
    setSerie(s);
    setScreen(anchorsComplete(s) ? 'serie_panels' : 'serie_anchors');
  }

  // Cria a série a partir do cânone confirmado (persiste) e vai para as âncoras.
  function handleSerieConfirm(titulo: string, desc: string, canon: Canon): void {
    const s = createSerie(titulo || 'Série sem título', desc, canon);
    ensureSerie(s);
    appendSerie(s.id, { kind: 'serie_start', titulo: s.titulo, estilo: canon.estiloId, personagens: canon.personagens.map((p) => p.nome) });
    saveSerie(s);
    setSerie(s);
    setScreen('serie_anchors');
  }

  function onMenu(id: MenuItem): void {
    if (id === 'criar') startCreate();
    else if (id === 'serie') setScreen('serie_menu');
    else if (id === 'sessions') setScreen('sessions');
    else if (id === 'add_style') setScreen('add_style');
    else if (id === 'config') setScreen('config');
    else if (id === 'sair') quit();
  }

  function body(): React.ReactNode {
    switch (screen) {
      case 'bootstrap':
        return (
          <Box>
            <Text color={theme.accent}>
              <Spinner type="dots" />
            </Text>
            <Text> preparando runtime…</Text>
          </Box>
        );
      case 'menu':
        return <MainMenu onSelect={onMenu} />;
      case 'compose':
        return (
          <ComposePanel
            styles={getAllStyles()}
            settings={settings}
            initial={compose ?? undefined}
            onSubmit={handleCompose}
            onCancel={returnToMenu}
          />
        );
      case 'generating':
        return (
          <Box flexDirection="column">
            <Box>
              <Text bold color={theme.accent}>
                Gerando e julgando{'  '}
              </Text>
              <Text color={theme.dim}>
                codex{session?.size ? ` · ${session.size}` : ''} ·{' '}
                {(compose?.judges.length ?? settings.judgePanel.length)} juiz(es) ·{' '}
                {(compose?.workers ?? settings.concurrency) === 0 ? 'todas de uma vez' : `${compose?.workers ?? settings.concurrency} workers`}
                {'  '}
              </Text>
              <Timer startedAt={workStartedAt} running={working} />
            </Box>
            <Box marginTop={1}>
              <ProgressPanel jobs={workingJobs} progress={progress} />
            </Box>
            <LogPanel entries={logs} max={10} title="log" />
          </Box>
        );
      case 'review':
        return (
          <Box flexDirection="column">
            {busy ? (
              <Box marginBottom={1}>
                <Text color={theme.accent}>
                  <Spinner type="dots" />
                </Text>
                <Text> reavaliando…</Text>
              </Box>
            ) : null}
            <VerdictGrid results={session?.results ?? []} bestIndex={bestIndex} selectedIndex={selectedIndex} />
            {notice ? (
              <Box marginTop={1}>
                <Text color={theme.accent} wrap="truncate-end">
                  {notice}
                </Text>
              </Box>
            ) : null}
          </Box>
        );
      case 'improve_question': {
        const t = session?.results[improveTargetRef.current];
        return t ? (
          <ImprovePrompt best={t} onDecide={handleImproveDecide} />
        ) : (
          <Messages title="Sem imagem para melhorar" color={theme.warn} lines={['Nenhum resultado aprovável.', 'q volta ao menu.']} />
        );
      }
      case 'prompt_view':
        return <PromptView title={promptView.title} prompt={promptView.prompt} suggested={promptView.suggested} />;
      case 'sessions':
        return (
          <SessionsScreen
            onOpen={(id) => {
              setDetailId(id);
              setScreen('session_detail');
            }}
            onBack={returnToMenu}
          />
        );
      case 'session_detail':
        return <SessionDetail id={detailId} onContinue={continueSession} onBack={() => setScreen('sessions')} />;
      case 'add_style':
        return <AddStyleScreen onDone={returnToMenu} />;
      case 'config':
        return (
          <ConfigScreen
            onDone={() => {
              setSettings(loadSettings());
              returnToMenu();
            }}
          />
        );
      case 'serie_menu':
        return <SerieMenu onNew={() => setScreen('serie_new')} onOpen={openSerie} onBack={returnToMenu} />;
      case 'serie_new':
        return <SerieNew onConfirm={handleSerieConfirm} onCancel={() => setScreen('serie_menu')} />;
      case 'serie_anchors':
        return serie ? (
          <SerieAnchors
            serie={serie}
            onUpdate={refreshSerie}
            onDone={() => setScreen('serie_panels')}
            onBack={() => setScreen('serie_menu')}
          />
        ) : (
          <Messages title="Sem série ativa" lines={['Abra ou crie uma série no menu Série.']} />
        );
      case 'serie_panels':
        return serie ? (
          <SeriePanels
            serie={serie}
            onUpdate={refreshSerie}
            onViewSheet={() => setScreen('serie_view')}
            onBack={() => setScreen('serie_menu')}
          />
        ) : (
          <Messages title="Sem série ativa" lines={['Abra ou crie uma série no menu Série.']} />
        );
      case 'serie_view':
        return serie ? (
          <SerieView serie={serie} onBack={() => setScreen('serie_panels')} />
        ) : (
          <Messages title="Sem série ativa" lines={['Abra ou crie uma série no menu Série.']} />
        );
      case 'done':
        return (
          <Box flexDirection="column">
            <Text bold color={theme.ok}>
              Concluído
            </Text>
            <Box marginTop={1}>
              <VerdictGrid results={session?.results ?? []} bestIndex={bestIndex} selectedIndex={bestIndex >= 0 ? bestIndex : 0} />
            </Box>
            <Box marginTop={1} flexDirection="column">
              <Box>
                <Text color={theme.dim}>tempo total: </Text>
                <Text bold>{session?.totalDurationMs != null ? `${(session.totalDurationMs / 1000).toFixed(1)}s` : '—'}</Text>
              </Box>
              <Box>
                <Text color={theme.dim}>custo estimado: </Text>
                <Text bold>{session?.estimatedCostUsd != null ? `~US$ ${session.estimatedCostUsd.toFixed(2)}` : '—'}</Text>
                <Text color={theme.dim}> (aprox., não é faturamento)</Text>
              </Box>
              <Box>
                <Text color={theme.dim}>imagens + página: </Text>
                <Text wrap="truncate-middle">{session?.pageDir ?? (session ? sessionDir(session.id) : '')}</Text>
              </Box>
              <Box>
                <Text color={theme.dim}>g = abrir a página · d = abrir a pasta</Text>
              </Box>
              {notice ? (
                <Box marginTop={1}>
                  <Text color={theme.accent} wrap="truncate-end">
                    {notice}
                  </Text>
                </Box>
              ) : null}
            </Box>
          </Box>
        );
      case 'fatal':
        return <Messages title="Não foi possível continuar" lines={fatalLines} />;
    }
  }

  const showContext = ['generating', 'review', 'improve_question', 'prompt_view', 'done'].includes(screen) && session;
  const context = showContext ? `iteração ${session!.iteration} · codex` : undefined;

  return (
    <Box flexDirection="column">
      <Banner />
      {body()}
      <StatusBar context={context} hints={HINTS[screen] ?? ''} />
    </Box>
  );
}
