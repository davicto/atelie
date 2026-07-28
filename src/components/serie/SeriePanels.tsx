import React, { useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import TextInput from 'ink-text-input';
import { theme } from '../../theme';
import { loadSettings } from '../../lib/settings';
import { generatePanel } from '../../lib/serie/panel';
import { saveSerie } from '../../lib/serie/store';
import { openViewer } from '../../lib/viewer';
import { LogPanel } from '../LogPanel';
import { Timer } from '../Timer';
import type { ConsistencyVerdict, LogEntry, Painel, Serie } from '../../types';

type Mode = 'list' | 'cena' | 'chars' | 'running' | 'review';

function nk(s: string): string {
  return s.trim().toLowerCase();
}

function nota(n?: number | null): string {
  return n == null ? '—' : String(n);
}

/**
 * Painéis: adicionar painel (cena + personagens presentes) → loop de coerência
 * (LogPanel + cronômetro + tentativas) → ÂNCORA × PAINEL com [Visualizar] de cada +
 * veredito/drifts → Aceitar/Melhorar/Regenerar. Lista os painéis já feitos.
 */
export function SeriePanels({
  serie,
  onUpdate,
  onViewSheet,
  onBack,
}: {
  serie: Serie;
  onUpdate: (s: Serie) => void;
  onViewSheet: () => void;
  onBack: () => void;
}) {
  const s = loadSettings();
  const chars = serie.canon.personagens;

  const [mode, setMode] = useState<Mode>('list');
  const [cena, setCena] = useState('');
  const [sel, setSel] = useState<Set<string>>(() => new Set(chars.map((c) => c.nome)));
  const [charCursor, setCharCursor] = useState(0);
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [startedAt, setStartedAt] = useState(0);
  const [reviewCursor, setReviewCursor] = useState(0);
  const [warn, setWarn] = useState('');

  const abortRef = useRef<AbortController | null>(null);
  const startRef = useRef(0);
  const currentRef = useRef<Painel | null>(null);

  const paineis = [...(serie.paineis ?? [])].sort((a, b) => a.n - b.n);

  function addLog(msg: string, level: LogEntry['level'] = 'info'): void {
    setLogs((prev) => [
      ...prev,
      { ts: new Date().toISOString(), elapsedMs: Date.now() - startRef.current, level, msg },
    ]);
  }

  // Itens visualizáveis na review: o painel + a âncora de cada personagem presente.
  function reviewItems(painel: Painel): Array<{ label: string; path?: string }> {
    const present = new Set(painel.personagens.map(nk));
    const anchors = chars
      .filter((c) => present.has(nk(c.nome)))
      .map((c) => ({ label: `Âncora ${c.nome}`, path: c.anchorPng }));
    return [{ label: `Painel ${painel.n}`, path: painel.pngPath }, ...anchors];
  }

  async function runLoop(painel: Painel, seedFeedback?: ConsistencyVerdict): Promise<void> {
    const started = Date.now();
    startRef.current = started;
    setStartedAt(started);
    setLogs([]);
    setBusy(true);
    setMode('running');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await generatePanel(serie, painel, {
        quality: 'high',
        seedFeedback,
        signal: controller.signal,
        onLog: (m) => addLog(m),
        onProgress: (e) => {
          if (e.percent >= 100) addLog('imagem gerada; julgando…');
        },
      });
      saveSerie(serie);
      onUpdate(serie);
      addLog(
        `painel ${painel.n}: consistência ${nota(painel.consistencia)} · cena ${nota(painel.cenaNota)} ${painel.aprovado ? '✓' : '✗'}`,
        painel.aprovado ? 'ok' : 'warn',
      );
    } catch (e: any) {
      addLog(`falha: ${String(e?.message ?? e)}`, 'err');
    }
    setBusy(false);
    setReviewCursor(0);
    setMode('review');
  }

  function startNewPanel(): void {
    const nomes = chars.filter((c) => sel.has(c.nome)).map((c) => c.nome);
    const personagens = nomes.length ? nomes : chars.map((c) => c.nome);
    const n = paineis.reduce((m, p) => Math.max(m, p.n), 0) + 1;
    const painel: Painel = { n, cena: cena.trim(), personagens };
    serie.paineis.push(painel);
    currentRef.current = painel;
    void runLoop(painel);
  }

  // Navegação principal (list / chars / review).
  useInput(
    (input, key) => {
      if (mode === 'list') {
        if (input === 'a') {
          setCena('');
          setSel(new Set(chars.map((c) => c.nome)));
          setWarn('');
          setMode('cena');
        } else if (input === 's') onViewSheet();
        else if (input === 'q' || key.escape) onBack();
        return;
      }
      if (mode === 'chars') {
        if (key.upArrow || input === 'k') setCharCursor((c) => (c - 1 + chars.length) % chars.length);
        else if (key.downArrow || input === 'j') setCharCursor((c) => (c + 1) % chars.length);
        else if (input === ' ') {
          const nome = chars[charCursor]?.nome;
          if (nome)
            setSel((prev) => {
              const next = new Set(prev);
              if (next.has(nome)) next.delete(nome);
              else next.add(nome);
              return next;
            });
        } else if (key.return) startNewPanel();
        else if (key.escape) setMode('cena');
        return;
      }
      if (mode === 'review') {
        const painel = currentRef.current;
        if (!painel) {
          setMode('list');
          return;
        }
        const items = reviewItems(painel);
        if (key.upArrow || input === 'k') setReviewCursor((c) => (c - 1 + items.length) % items.length);
        else if (key.downArrow || input === 'j') setReviewCursor((c) => (c + 1) % items.length);
        else if (input === 'o' || input === 'v') {
          const p = items[reviewCursor]?.path;
          if (p) openViewer(p);
        } else if (input === 'a') setMode('list');
        else if (input === 'm') {
          const seed: ConsistencyVerdict = {
            consistencia: painel.consistencia ?? null,
            cenaNota: painel.cenaNota ?? null,
            drifts: painel.drifts ?? [],
            sugestao_melhoria: painel.sugestao_melhoria ?? '',
            prompt_sugerido: painel.prompt_sugerido ?? '',
          };
          void runLoop(painel, seed);
        } else if (input === 'r') void runLoop(painel);
        else if (input === 'q' || key.escape) setMode('list');
      }
    },
    { isActive: (mode === 'list' || mode === 'chars' || mode === 'review') && !busy },
  );

  // Esc cancela a digitação da cena.
  useInput(
    (_input, key) => {
      if (key.escape) setMode('list');
    },
    { isActive: mode === 'cena' },
  );

  // Cancelamento do loop.
  useInput(
    (input) => {
      if (input === 'q') abortRef.current?.abort();
    },
    { isActive: busy },
  );

  // ── Render ────────────────────────────────────────────────────────────────
  if (mode === 'running') {
    const painel = currentRef.current;
    return (
      <Box flexDirection="column">
        <Box>
          <Text bold color={theme.accent}>
            Painel {painel?.n} · loop de coerência{'  '}
          </Text>
          <Text color={theme.dim}>
            limiar consist. {s.consistThreshold} · cena {s.cenaThreshold} · até {s.maxTentativas} tentativa(s){'  '}
          </Text>
          <Timer startedAt={startedAt} running={busy} />
        </Box>
        {painel ? (
          <Text color={theme.dim} wrap="truncate-end">
            cena: {painel.cena}
          </Text>
        ) : null}
        <LogPanel entries={logs} max={10} title="log" />
        <Box marginTop={1}>
          <Text color={theme.dim}>q cancela</Text>
        </Box>
      </Box>
    );
  }

  if (mode === 'cena') {
    return (
      <Box flexDirection="column">
        <Text bold color={theme.accent}>
          Novo painel · cena
        </Text>
        <Text color={theme.dim}>Descreva a ação/cena deste quadro. Enter avança · Esc cancela.</Text>
        <Box marginTop={1}>
          <Text color={theme.primaryLight}>{'› '}</Text>
          <TextInput
            value={cena}
            onChange={setCena}
            onSubmit={(v) => {
              if (!v.trim()) return;
              if (chars.length > 1) {
                setCharCursor(0);
                setMode('chars');
              } else startNewPanel();
            }}
            placeholder="ex.: Mia corre pela ponte enquanto o corvo voa ao lado"
          />
        </Box>
      </Box>
    );
  }

  if (mode === 'chars') {
    return (
      <Box flexDirection="column">
        <Text bold color={theme.accent}>
          Novo painel · personagens presentes ({sel.size})
        </Text>
        <Box flexDirection="column" marginTop={1}>
          {chars.map((c, i) => {
            const active = i === charCursor;
            const on = sel.has(c.nome);
            return (
              <Box key={c.nome + i}>
                <Text color={on ? theme.ok : theme.dim}>{'  ' + (on ? '[x]' : '[ ]') + ' '}</Text>
                <Text
                  bold={active}
                  color={active ? theme.primary : undefined}
                  backgroundColor={active ? theme.accent : undefined}
                >
                  {' ' + c.nome + ' '}
                </Text>
              </Box>
            );
          })}
        </Box>
        <Box marginTop={1}>
          <Text color={theme.dim}>espaço marca · Enter gera (loop) · Esc volta à cena</Text>
        </Box>
      </Box>
    );
  }

  if (mode === 'review') {
    const painel = currentRef.current;
    if (!painel) return null;
    const items = reviewItems(painel);
    const okC = painel.consistencia != null && painel.consistencia >= s.consistThreshold;
    return (
      <Box flexDirection="column">
        <Box>
          <Text bold color={theme.accent}>
            Painel {painel.n}{'  '}
          </Text>
          <Text color={painel.aprovado ? theme.ok : theme.warn}>
            {painel.aprovado ? 'aprovado ✓' : 'abaixo do limiar ✗'}
          </Text>
          <Text color={theme.dim}>
            {'  '}consistência {nota(painel.consistencia)} · cena {nota(painel.cenaNota)} · {painel.tentativas ?? 1} tentativa(s)
          </Text>
        </Box>

        <Box flexDirection="column" marginTop={1}>
          <Text color={theme.dim}>âncora × painel — o/v visualiza o selecionado</Text>
          {items.map((it, i) => {
            const active = i === reviewCursor;
            return (
              <Box key={it.label}>
                <Text
                  bold={active}
                  color={active ? theme.primary : undefined}
                  backgroundColor={active ? theme.accent : undefined}
                >
                  {' ' + (active ? '›' : ' ') + ' ' + it.label + ' '}
                </Text>
                <Text> </Text>
                {it.path ? (
                  <>
                    <Text color={active ? theme.accent : theme.primaryLight}>[Visualizar]</Text>
                    <Text color={theme.dim}> {it.path}</Text>
                  </>
                ) : (
                  <Text color={theme.dim}>(sem arquivo)</Text>
                )}
              </Box>
            );
          })}
        </Box>

        <Box flexDirection="column" marginTop={1}>
          <Text color={theme.dim}>cena</Text>
          <Text wrap="wrap">{painel.cena}</Text>
          {painel.drifts?.length ? (
            <Box flexDirection="column" marginTop={1}>
              <Text color={theme.dim}>drifts {okC ? '' : '(consistência abaixo do limiar)'}</Text>
              {painel.drifts.map((d, k) => (
                <Text key={k} color={theme.warn} wrap="wrap">
                  {'- ' + d}
                </Text>
              ))}
            </Box>
          ) : null}
          {painel.sugestao_melhoria ? (
            <Box flexDirection="column" marginTop={1}>
              <Text color={theme.dim}>sugestão</Text>
              <Text color={theme.warn} wrap="wrap">
                {painel.sugestao_melhoria}
              </Text>
            </Box>
          ) : null}
        </Box>

        <Box marginTop={1}>
          <Text color={theme.dim}>a aceitar · m melhorar (reforça drifts) · r regenerar · o/v visualizar · q lista</Text>
        </Box>
      </Box>
    );
  }

  // mode === 'list'
  return (
    <Box flexDirection="column">
      <Text bold color={theme.accent}>
        Painéis — {serie.titulo}
      </Text>
      <Text color={theme.dim}>
        {paineis.length} painel(is) · {paineis.filter((p) => p.aprovado).length} aprovado(s)
      </Text>

      <Box flexDirection="column" marginTop={1}>
        {!paineis.length ? (
          <Text color={theme.dim}>Nenhum painel ainda. Pressione "a" para adicionar o primeiro.</Text>
        ) : (
          paineis.map((p) => (
            <Box key={p.n}>
              <Text color={theme.primaryLight}>{`  #${p.n} `}</Text>
              <Text color={p.aprovado ? theme.ok : theme.warn}>{p.aprovado ? '✓' : '✗'}</Text>
              <Text color={theme.dim}>
                {`  consist. ${nota(p.consistencia)} · cena ${nota(p.cenaNota)}  `}
              </Text>
              <Text wrap="truncate-end">{p.cena}</Text>
            </Box>
          ))
        )}
      </Box>

      {warn ? (
        <Box marginTop={1}>
          <Text color={theme.warn}>{warn}</Text>
        </Box>
      ) : null}

      <Box marginTop={1}>
        <Text color={theme.dim}>a adicionar painel · s abrir galeria (contact-sheet) · q volta</Text>
      </Box>
    </Box>
  );
}
