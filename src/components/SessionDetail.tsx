import React, { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { theme } from '../theme';
import { loadFullSession } from '../lib/sessions';
import { findStyle } from '../lib/userStyles';
import { compose } from '../lib/promptComposer';
import { reJudge } from '../lib/pipeline';
import { loadSettings } from '../lib/settings';
import { estimateSessionCost } from '../lib/cost';
import { publishSession } from '../lib/contactSheet';
import { SessionLogger } from '../lib/logger';
import { append, writeSnapshot } from '../state/manifest';
import { openFolder, openViewer } from '../lib/viewer';
import type { Session } from '../types';
import { PromptView } from './PromptView';

type Img = { iteration: number; pngPath: string; styleId: string; nota: number | null; jobId: string };

function pad(s: string, w: number): string {
  const v = s ?? '';
  return v.length >= w ? v.slice(0, w) : v + ' '.repeat(w - v.length);
}

/**
 * Detalhe de uma sessão: imagens (estilo/versão/nota/caminho) com [Visualizar],
 * ver prompt completo, ver log (events.log), Reavaliar e Continuar.
 */
export function SessionDetail({
  id,
  onContinue,
  onBack,
}: {
  id: string;
  onContinue: (s: Session) => void;
  onBack: () => void;
}) {
  const full = useMemo(() => loadFullSession(id), [id]);
  const cost = useMemo(() => (full ? estimateSessionCost(full.session) : null), [full]);
  const [images, setImages] = useState<Img[]>(() => full?.images ?? []);
  const [cursor, setCursor] = useState(0);
  const [phase, setPhase] = useState<'list' | 'prompt' | 'log'>('list');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  function promptFor(img: Img): { prompt: string; suggested?: string } {
    if (!full) return { prompt: '' };
    const sess = full.session;
    const match = sess.results.find((r) => r.pngPath === img.pngPath);
    if (match?.job.prompt) return { prompt: match.job.prompt, suggested: match.verdict?.prompt_sugerido };
    const byOut = sess.jobs.find((j) => j.outPath === img.pngPath);
    if (byOut?.prompt) return { prompt: byOut.prompt };
    const style = findStyle(img.styleId);
    return { prompt: style ? compose(sess.request, style) : sess.request };
  }

  async function doReJudge() {
    if (!full) return;
    const im = images[cursor];
    if (!im?.pngPath) return;
    setBusy(true);
    const style = findStyle(im.styleId);
    const info = style ? { nome: style.nome, desc: style.desc } : { nome: im.styleId, desc: '' };
    const logger = new SessionLogger(full.session.id, Date.now());
    logger.log(`reavaliando ${im.styleId} (iter ${im.iteration})…`);
    try {
      const verdict = await reJudge(im.pngPath, full.session.request, info, loadSettings().judgeModel);
      logger.log(
        `novo veredito: nota ${verdict.nota ?? '—'} ${verdict.aprovado ? '✓' : '✗'}`,
        verdict.aprovado ? 'ok' : 'warn',
      );
      // Persiste a nova nota (espelha App.doReJudge): atualiza o result no snapshot e
      // registra o veredito COM jobId — sem jobId o append vira registro órfão.
      const results = (full.session.results ?? []).map((r) => (r.job.id === im.jobId ? { ...r, verdict } : r));
      full.session.results = results;
      writeSnapshot(full.session);
      append(full.session.id, { kind: 'verdict', iteration: im.iteration, jobId: im.jobId, styleId: im.styleId, nota: verdict.nota, aprovado: verdict.aprovado });
      setImages((prev) => prev.map((x, i) => (i === cursor ? { ...x, nota: verdict.nota } : x)));
    } catch (e: any) {
      logger.log(`falha ao reavaliar: ${String(e?.message ?? e)}`, 'err');
    }
    setBusy(false);
  }

  /** Abre a pasta pública (republica se ainda não existir). */
  function doOpenFolder() {
    if (!full) return;
    try {
      const dir = full.session.pageDir ?? publishSession(full.session.id).dir;
      openFolder(dir);
      setNotice(`pasta: ${dir}`);
    } catch (e: any) {
      setNotice(`falha ao abrir a pasta: ${String(e?.message ?? e)}`);
    }
  }

  /** Republica TUDO e abre a página da sessão. */
  function doGallery() {
    if (!full) return;
    try {
      const pub = publishSession(full.session.id);
      openViewer(pub.page);
      setNotice(`página: ${pub.page}`);
    } catch (e: any) {
      setNotice(`falha na página: ${String(e?.message ?? e)}`);
    }
  }

  useInput((input, key) => {
    if (busy) return;
    if (phase !== 'list') {
      if (key.escape || input === 'q') setPhase('list');
      return;
    }
    if (key.escape || input === 'q') {
      onBack();
      return;
    }
    if (input === 'g') {
      doGallery();
      return;
    }
    if (input === 'd') {
      doOpenFolder();
      return;
    }
    if (!images.length) return;
    if (key.upArrow || input === 'k') setCursor((c) => (c - 1 + images.length) % images.length);
    else if (key.downArrow || input === 'j') setCursor((c) => (c + 1) % images.length);
    else if (input === 'o' || input === 'v') {
      const im = images[cursor];
      if (im?.pngPath) openViewer(im.pngPath);
    } else if (input === 'p') setPhase('prompt');
    else if (input === 'l') setPhase('log');
    else if (input === 'c' && full) onContinue(full.session);
    else if (input === 'r') void doReJudge();
  });

  if (!full) {
    return (
      <Box flexDirection="column">
        <Text color={theme.err}>Sessão "{id}" não encontrada.</Text>
        <Text color={theme.dim}>q volta.</Text>
      </Box>
    );
  }

  if (phase === 'prompt') {
    const { prompt, suggested } = promptFor(images[cursor]);
    return (
      <PromptView
        title={`Prompt — ${findStyle(images[cursor]?.styleId)?.nome ?? images[cursor]?.styleId} (iter ${images[cursor]?.iteration})`}
        prompt={prompt}
        suggested={suggested}
      />
    );
  }

  if (phase === 'log') {
    const tail = full.log.slice(-30);
    return (
      <Box flexDirection="column">
        <Text bold color={theme.accent}>
          Log da sessão (events.log)
        </Text>
        <Box flexDirection="column" marginTop={1}>
          {tail.length === 0 ? <Text color={theme.dim}>(vazio)</Text> : null}
          {tail.map((l, i) => (
            <Text key={i} color={theme.dim} wrap="truncate-end">
              {l}
            </Text>
          ))}
        </Box>
        <Text color={theme.dim}>Esc/q volta.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold color={theme.accent}>
        Sessão {id}
      </Text>
      <Box>
        <Text color={theme.dim}>pedido: </Text>
        <Text wrap="truncate-end">{full.session.request}</Text>
      </Box>
      <Box>
        <Text color={theme.dim}>tempo: </Text>
        <Text>{full.session.totalDurationMs != null ? `${(full.session.totalDurationMs / 1000).toFixed(1)}s` : '—'}</Text>
        <Text color={theme.dim}>  ·  custo estimado: </Text>
        <Text>{cost ? `~US$ ${cost.usd.toFixed(2)}` : '—'}</Text>
        <Text color={theme.dim}> (aprox.)</Text>
      </Box>
      {busy ? (
        <Box marginTop={1}>
          <Text color={theme.accent}>
            <Spinner type="dots" />
          </Text>
          <Text> reavaliando…</Text>
        </Box>
      ) : null}
      {!images.length ? (
        <Box marginTop={1}>
          <Text color={theme.dim}>(nenhuma imagem registrada)</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          <Text color={theme.dim}>{pad('  iter', 8) + pad('estilo', 18) + pad('nota', 6) + 'caminho'}</Text>
          {images.map((im, i) => {
            const active = i === cursor;
            const nome = findStyle(im.styleId)?.nome ?? im.styleId;
            const nota = im.nota != null ? String(im.nota) : '—';
            return (
              <Box key={im.pngPath + i}>
                <Text
                  bold={active}
                  color={active ? theme.primary : undefined}
                  backgroundColor={active ? theme.accent : undefined}
                >
                  {pad((active ? '› ' : '  ') + String(im.iteration), 8)}
                </Text>
                <Text>{pad(nome, 18)}</Text>
                <Text color={theme.primaryLight}>{pad(nota, 6)}</Text>
                <Text color={theme.dim} wrap="truncate-middle">
                  {im.pngPath}
                </Text>
              </Box>
            );
          })}
        </Box>
      )}
      {notice ? (
        <Box marginTop={1}>
          <Text color={theme.accent} wrap="truncate-end">
            {notice}
          </Text>
        </Box>
      ) : null}
      <Box marginTop={1}>
        <Text color={theme.dim}>
          ↑↓ imagem · o ver · p prompt · l log · c continuar · r reavaliar · f favoritar · x exportar · g galeria · q volta
        </Text>
      </Box>
    </Box>
  );
}
