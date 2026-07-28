import React, { useMemo, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import TextInput from 'ink-text-input';
import { theme } from '../../theme';
import { generateAnchor } from '../../lib/serie/anchor';
import { appendSerie, saveSerie } from '../../lib/serie/store';
import { openViewer } from '../../lib/viewer';
import { LogPanel } from '../LogPanel';
import { Timer } from '../Timer';
import type { LogEntry, Serie } from '../../types';

/**
 * Âncoras: por personagem gera um character sheet (codex); usuário Visualiza e
 * Aceita/Melhora/Regenera em loop. Só avança (onDone) quando todas aprovadas.
 */
export function SerieAnchors({
  serie,
  onUpdate,
  onDone,
  onBack,
}: {
  serie: Serie;
  onUpdate: (s: Serie) => void;
  onDone: () => void;
  onBack: () => void;
}) {
  const chars = serie.canon.personagens;
  const [cursor, setCursor] = useState(0);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'idle' | 'note'>('idle');
  const [note, setNote] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [startedAt, setStartedAt] = useState(0);
  const [approved, setApproved] = useState<Set<number>>(() => new Set());
  const [warn, setWarn] = useState('');

  const abortRef = useRef<AbortController | null>(null);
  const startRef = useRef(0);
  const cur = chars[cursor];
  const allApproved = useMemo(
    () => chars.length > 0 && chars.every((_, i) => approved.has(i)),
    [chars, approved],
  );

  function addLog(msg: string, level: LogEntry['level'] = 'info'): void {
    setLogs((prev) => [
      ...prev,
      { ts: new Date().toISOString(), elapsedMs: Date.now() - startRef.current, level, msg },
    ]);
  }

  async function gen(extra?: string): Promise<void> {
    if (busy || !cur) return;
    const started = Date.now();
    startRef.current = started;
    setStartedAt(started);
    setLogs([]);
    setBusy(true);
    setWarn('');
    // Ao regenerar, a âncora deixa de estar aprovada.
    setApproved((prev) => {
      const next = new Set(prev);
      next.delete(cursor);
      return next;
    });
    const controller = new AbortController();
    abortRef.current = controller;
    addLog(`gerando âncora de ${cur.nome}…`);
    try {
      const { pngPath } = await generateAnchor(serie.canon, cur, {
        serieId: serie.id,
        quality: 'high',
        extra,
        signal: controller.signal,
        onProgress: (e) => {
          if (e.percent >= 100) addLog('imagem salva', 'ok');
        },
      });
      appendSerie(serie.id, { kind: 'anchor', nome: cur.nome, anchorPng: pngPath });
      saveSerie(serie);
      addLog(`âncora pronta: ${pngPath}`, 'ok');
      onUpdate(serie);
    } catch (e: any) {
      addLog(`falha: ${String(e?.message ?? e)}`, 'err');
    }
    setBusy(false);
  }

  useInput(
    (input, key) => {
      if (busy) {
        if (input === 'q') abortRef.current?.abort();
        return;
      }
      if (mode === 'note') return;
      if (key.upArrow || input === 'k') setCursor((c) => (c - 1 + chars.length) % chars.length);
      else if (key.downArrow || input === 'j') setCursor((c) => (c + 1) % chars.length);
      else if (input === 'g') void gen();
      else if (input === 'v' || input === 'o') {
        if (cur?.anchorPng) openViewer(cur.anchorPng);
      } else if (input === 'a') {
        if (!cur?.anchorPng) {
          setWarn('gere a âncora antes de aceitar (g).');
          return;
        }
        setApproved((prev) => new Set(prev).add(cursor));
        setWarn('');
      } else if (input === 'm') {
        if (!cur?.anchorPng) {
          setWarn('gere a âncora primeiro (g); "Melhorar" ajusta a partir dela.');
          return;
        }
        setNote('');
        setMode('note');
      } else if (key.return) {
        if (allApproved) onDone();
        else setWarn('aceite (a) a âncora de todos os personagens antes de avançar.');
      } else if (input === 'q' || key.escape) onBack();
    },
    { isActive: mode === 'idle' || busy },
  );

  useInput(
    (_input, key) => {
      if (key.escape) setMode('idle');
    },
    { isActive: mode === 'note' && !busy },
  );

  if (busy) {
    return (
      <Box flexDirection="column">
        <Box>
          <Text color={theme.accent}>
            <Spinner type="dots" />
          </Text>
          <Text> gerando âncora de {cur?.nome}… </Text>
          <Timer startedAt={startedAt} running />
        </Box>
        <LogPanel entries={logs} max={8} title="log" />
        <Box marginTop={1}>
          <Text color={theme.dim}>q cancela</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold color={theme.accent}>
        Âncoras — {serie.titulo}
      </Text>
      <Text color={theme.dim}>
        Character sheet por personagem. Aprovadas {approved.size}/{chars.length}.
      </Text>

      <Box flexDirection="column" marginTop={1}>
        {chars.map((p, i) => {
          const active = i === cursor;
          const has = !!p.anchorPng;
          const ok = approved.has(i);
          const status = ok ? 'aprovada ✓' : has ? 'gerada' : 'pendente';
          const statusColor = ok ? theme.ok : has ? theme.primaryLight : theme.dim;
          return (
            <Box key={p.nome + i}>
              <Text
                bold={active}
                color={active ? theme.primary : undefined}
                backgroundColor={active ? theme.accent : undefined}
              >
                {' ' + (active ? '›' : ' ') + ' ' + p.nome + ' '}
              </Text>
              <Text> </Text>
              <Text color={statusColor}>{status}</Text>
              {has ? <Text color={active ? theme.accent : theme.primaryLight}> [Visualizar]</Text> : null}
            </Box>
          );
        })}
      </Box>

      {cur ? (
        <Box flexDirection="column" marginTop={1}>
          <Text color={theme.dim} wrap="wrap">
            {cur.descricao}
          </Text>
          {cur.anchorPng ? (
            <Box>
              <Text color={theme.dim}>âncora: </Text>
              <Text wrap="truncate-middle">{cur.anchorPng}</Text>
            </Box>
          ) : null}
        </Box>
      ) : null}

      {mode === 'note' ? (
        <Box marginTop={1}>
          <Text color={theme.accent}>ajuste: </Text>
          <TextInput value={note} onChange={setNote} onSubmit={(v) => void gen(v)} focus />
        </Box>
      ) : null}

      {warn ? (
        <Box marginTop={1}>
          <Text color={theme.warn}>{warn}</Text>
        </Box>
      ) : null}

      <Box marginTop={1}>
        <Text color={theme.dim}>
          g gera/regenera · v visualizar · a aceitar · m melhorar · Enter avança{allApproved ? ' (pronto)' : ''} · q volta
        </Text>
      </Box>
    </Box>
  );
}
