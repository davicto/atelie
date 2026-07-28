import React, { useMemo, useState } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import { theme } from '../theme';
import type { JudgeSpec, Settings } from '../types';
import type { StyleDef } from '../styles/catalog.types';

/** Tudo que o painel coleta antes de gerar. */
export interface ComposeValue {
  request: string;
  styleIds: string[];
  versionsByStyle: Record<string, number>;
  size?: string;
  workers: number; // 0 = todos de uma vez
  judges: JudgeSpec[];
  avoid: string;
  refs: string;
}

const SIZES: { label: string; size?: string }[] = [
  { label: 'Padrão do estilo', size: undefined },
  { label: 'Retrato 1536×2048', size: '1536x2048' },
  { label: 'Quadrado 2048²', size: '2048x2048' },
  { label: 'Quadrado 1024²', size: '1024x1024' },
  { label: 'Paisagem 2048×1152', size: '2048x1152' },
  { label: 'Wide 2048×896', size: '2048x896' },
];

const WORKER_STEPS = [0, 1, 2, 3, 4, 6, 8, 12, 16, 24];
const COL_W = 26;
const LIST_H = 12;

type ColId = 'pedido' | 'estilos' | 'versoes' | 'dimensao' | 'workers' | 'juizes' | 'evitar' | 'refs' | 'gerar';
const COLS: { id: ColId; title: string }[] = [
  { id: 'pedido', title: '1 · Pedido' },
  { id: 'estilos', title: '2 · Estilos' },
  { id: 'versoes', title: '3 · Versões' },
  { id: 'dimensao', title: '4 · Dimensão' },
  { id: 'workers', title: '5 · Workers' },
  { id: 'juizes', title: '6 · Juízes' },
  { id: 'evitar', title: '7 · Evitar' },
  { id: 'refs', title: '8 · Refs' },
  { id: 'gerar', title: '9 · Gerar' },
];

/** Janela de rolagem centrada no cursor. */
function windowed<T>(items: T[], cursor: number, height: number): { view: T[]; start: number } {
  if (items.length <= height) return { view: items, start: 0 };
  const start = Math.min(Math.max(0, cursor - Math.floor(height / 2)), items.length - height);
  return { view: items.slice(start, start + height), start };
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, Math.max(0, n - 1)) + '…';
}

/**
 * Painel ÚNICO de composição do pedido: uma coluna por decisão, lado a lado.
 * Tab/Shift+Tab (ou ←/→ nas colunas de lista) andam entre colunas e as escolhas
 * já feitas continuam visíveis à esquerda — nada de telas que somem.
 */
export function ComposePanel({
  styles,
  settings,
  initial,
  onSubmit,
  onCancel,
}: {
  styles: StyleDef[];
  settings: Settings;
  initial?: Partial<ComposeValue>;
  onSubmit: (v: ComposeValue) => void;
  onCancel: () => void;
}) {
  const { stdout } = useStdout();
  const [col, setCol] = useState(0);

  const [request, setRequest] = useState(initial?.request ?? '');
  const [selected, setSelected] = useState<string[]>(initial?.styleIds ?? []);
  const [versions, setVersions] = useState<Record<string, number>>(initial?.versionsByStyle ?? {});
  const [size, setSize] = useState<string | undefined>(initial?.size);
  const [workers, setWorkers] = useState<number>(initial?.workers ?? settings.concurrency);
  const [judges, setJudges] = useState<JudgeSpec[]>(initial?.judges ?? settings.judgePanel);
  const [avoid, setAvoid] = useState(initial?.avoid ?? '');
  const [refs, setRefs] = useState(initial?.refs ?? '');
  const [warn, setWarn] = useState('');

  // cursores internos de cada coluna
  const [styleCursor, setStyleCursor] = useState(0);
  const [filter, setFilter] = useState('');
  const [filtering, setFiltering] = useState(false);
  const [verCursor, setVerCursor] = useState(0);
  const [sizeCursor, setSizeCursor] = useState(() => Math.max(0, SIZES.findIndex((s) => s.size === initial?.size)));
  const [judgeCursor, setJudgeCursor] = useState(0);

  const pool: JudgeSpec[] = useMemo(() => {
    const base = settings.judgePanel.length ? settings.judgePanel : [settings.singleJudge];
    const seen = new Set<string>();
    const out: JudgeSpec[] = [];
    for (const j of [...base, settings.singleJudge]) {
      const k = `${j.provider}:${j.model}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(j);
    }
    return out;
  }, [settings]);

  const visibleStyles = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return styles;
    return styles.filter((s) => `${s.nome} ${s.desc} ${s.grupo} ${s.id}`.toLowerCase().includes(f));
  }, [styles, filter]);

  const versionOf = (id: string): number => versions[id] ?? settings.defaultVersionsPerStyle;
  const total = selected.reduce((a, id) => a + versionOf(id), 0);
  const judgeKey = (j: JudgeSpec) => `${j.provider}:${j.model}`;
  const judgeOn = (j: JudgeSpec) => judges.some((x) => judgeKey(x) === judgeKey(j));

  function go(delta: number): void {
    setWarn('');
    setCol((c) => Math.min(COLS.length - 1, Math.max(0, c + delta)));
  }

  function submit(): void {
    if (!request.trim()) {
      setWarn('escreva o pedido (coluna 1)');
      setCol(0);
      return;
    }
    if (!selected.length) {
      setWarn('escolha ao menos um estilo (coluna 2)');
      setCol(1);
      return;
    }
    if (!judges.length) {
      setWarn('escolha ao menos um juiz (coluna 6)');
      setCol(5);
      return;
    }
    const versionsByStyle: Record<string, number> = {};
    for (const id of selected) versionsByStyle[id] = versionOf(id);
    onSubmit({ request: request.trim(), styleIds: selected, versionsByStyle, size, workers, judges, avoid: avoid.trim(), refs: refs.trim() });
  }

  const active = COLS[col].id;
  const isText = active === 'pedido' || active === 'evitar' || active === 'refs';

  useInput((input, key) => {
    if (key.escape) {
      if (filtering) {
        setFiltering(false);
        return;
      }
      onCancel();
      return;
    }
    if (key.tab) {
      go(key.shift ? -1 : 1);
      return;
    }
    if (filtering) return; // o TextInput do filtro consome o resto
    if (isText) {
      // TextInput cuida das letras; Enter avança (submete na última coluna).
      if (key.return) {
        if (active === 'refs') submit();
        else go(1);
      }
      return;
    }

    // Colunas de lista: ←/→ também navegam (exceto onde ajustam valor).
    switch (active) {
      case 'estilos': {
        if (key.upArrow) setStyleCursor((c) => (c - 1 + visibleStyles.length) % Math.max(1, visibleStyles.length));
        else if (key.downArrow) setStyleCursor((c) => (c + 1) % Math.max(1, visibleStyles.length));
        else if (input === ' ') {
          const s = visibleStyles[styleCursor];
          if (s) {
            setSelected((prev) => (prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id]));
            setWarn('');
          }
        } else if (input === 'a') setSelected(visibleStyles.map((s) => s.id));
        else if (input === 'n') setSelected([]);
        else if (input === '/') {
          setFiltering(true);
          setStyleCursor(0);
        } else if (key.leftArrow) go(-1);
        else if (key.rightArrow || key.return) go(1);
        return;
      }
      case 'versoes': {
        const list = selected;
        if (!list.length) {
          if (key.leftArrow) go(-1);
          else if (key.rightArrow || key.return) go(1);
          return;
        }
        if (key.upArrow) setVerCursor((c) => (c - 1 + list.length) % list.length);
        else if (key.downArrow) setVerCursor((c) => (c + 1) % list.length);
        else if (key.rightArrow || input === '+' || input === '=') {
          const id = list[verCursor];
          setVersions((v) => ({ ...v, [id]: Math.min(12, versionOf(id) + 1) }));
        } else if (key.leftArrow || input === '-') {
          const id = list[verCursor];
          setVersions((v) => ({ ...v, [id]: Math.max(1, versionOf(id) - 1) }));
        } else if (/^[1-9]$/.test(input)) {
          const id = list[verCursor];
          setVersions((v) => ({ ...v, [id]: Number(input) }));
        } else if (input === 'A') {
          // aplica o valor do estilo sob o cursor a TODOS
          const n = versionOf(list[verCursor]);
          setVersions(Object.fromEntries(list.map((id) => [id, n])));
        } else if (key.return) go(1);
        return;
      }
      case 'dimensao': {
        // O cursor É a escolha: mover já fixa a dimensão (nada de confirmar duas vezes).
        if (key.upArrow) {
          const n = (sizeCursor - 1 + SIZES.length) % SIZES.length;
          setSizeCursor(n);
          setSize(SIZES[n].size);
        } else if (key.downArrow) {
          const n = (sizeCursor + 1) % SIZES.length;
          setSizeCursor(n);
          setSize(SIZES[n].size);
        } else if (key.leftArrow) go(-1);
        else if (key.rightArrow || key.return) go(1);
        return;
      }
      case 'workers': {
        const i = WORKER_STEPS.indexOf(workers);
        const cur = i >= 0 ? i : 0;
        if (key.upArrow || input === '+' || input === '=') setWorkers(WORKER_STEPS[Math.min(WORKER_STEPS.length - 1, cur + 1)]);
        else if (key.downArrow || input === '-') setWorkers(WORKER_STEPS[Math.max(0, cur - 1)]);
        else if (/^[0-9]$/.test(input)) setWorkers(Number(input));
        else if (key.leftArrow) go(-1);
        else if (key.rightArrow || key.return) go(1);
        return;
      }
      case 'juizes': {
        if (key.upArrow) setJudgeCursor((c) => (c - 1 + pool.length) % pool.length);
        else if (key.downArrow) setJudgeCursor((c) => (c + 1) % pool.length);
        else if (input === ' ') {
          const j = pool[judgeCursor];
          if (j) {
            setJudges((prev) => (prev.some((x) => judgeKey(x) === judgeKey(j)) ? prev.filter((x) => judgeKey(x) !== judgeKey(j)) : [...prev, j]));
            setWarn('');
          }
        } else if (key.leftArrow) go(-1);
        else if (key.rightArrow || key.return) go(1);
        return;
      }
      case 'gerar': {
        if (key.return) submit();
        else if (key.leftArrow) go(-1);
        return;
      }
    }
  });

  // ── Render de cada coluna ────────────────────────────────────────────────
  function renderCol(id: ColId, isActive: boolean): React.ReactNode {
    const dim = !isActive;
    switch (id) {
      case 'pedido':
        return isActive ? (
          <Box flexDirection="column">
            <TextInput value={request} onChange={setRequest} placeholder="o que gerar…" />
            <Text color={theme.dim}>Enter avança</Text>
          </Box>
        ) : (
          <Text color={request ? undefined : theme.dim} wrap="wrap">
            {request ? truncate(request, 90) : '—'}
          </Text>
        );

      case 'estilos': {
        if (dim) {
          return (
            <Box flexDirection="column">
              <Text bold color={theme.ok}>{selected.length} selecionado(s)</Text>
              {selected.slice(0, 8).map((sid) => (
                <Text key={sid} color={theme.dim}>· {truncate(styles.find((s) => s.id === sid)?.nome ?? sid, COL_W - 3)}</Text>
              ))}
              {selected.length > 8 ? <Text color={theme.dim}>… +{selected.length - 8}</Text> : null}
            </Box>
          );
        }
        const { view, start } = windowed(visibleStyles, styleCursor, LIST_H);
        return (
          <Box flexDirection="column">
            {filtering ? (
              <Box>
                <Text color={theme.accent}>/ </Text>
                <TextInput value={filter} onChange={setFilter} onSubmit={() => setFiltering(false)} />
              </Box>
            ) : (
              <Text color={theme.dim}>espaço marca · / busca · a todos · n nenhum</Text>
            )}
            {start > 0 ? <Text color={theme.dim}>↑ …</Text> : null}
            {view.map((s, i) => {
              const idx = start + i;
              const cur = idx === styleCursor;
              const on = selected.includes(s.id);
              return (
                <Box key={s.id}>
                  <Text color={on ? theme.ok : theme.dim}>{on ? '[x] ' : '[ ] '}</Text>
                  <Text bold={cur} color={cur ? theme.primary : undefined} backgroundColor={cur ? theme.accent : undefined}>
                    {truncate(s.nome, COL_W - 6)}
                  </Text>
                </Box>
              );
            })}
            {start + LIST_H < visibleStyles.length ? <Text color={theme.dim}>↓ …</Text> : null}
          </Box>
        );
      }

      case 'versoes': {
        if (!selected.length) return <Text color={theme.dim}>escolha estilos antes</Text>;
        if (dim) {
          return (
            <Box flexDirection="column">
              <Text bold>{total} imagem(ns)</Text>
              <Text color={theme.dim}>{selected.length} estilo(s)</Text>
            </Box>
          );
        }
        const { view, start } = windowed(selected, verCursor, LIST_H);
        return (
          <Box flexDirection="column">
            <Text color={theme.dim}>←/→ ajusta · dígito define · A aplica a todos</Text>
            {start > 0 ? <Text color={theme.dim}>↑ …</Text> : null}
            {view.map((sid, i) => {
              const idx = start + i;
              const cur = idx === verCursor;
              return (
                <Box key={sid}>
                  <Text bold={cur} color={cur ? theme.primary : undefined} backgroundColor={cur ? theme.accent : undefined}>
                    {truncate(styles.find((s) => s.id === sid)?.nome ?? sid, COL_W - 8)}
                  </Text>
                  <Text color={theme.ok}> ×{versionOf(sid)}</Text>
                </Box>
              );
            })}
            {start + LIST_H < selected.length ? <Text color={theme.dim}>↓ …</Text> : null}
            <Text color={theme.primaryLight}>total {total}</Text>
          </Box>
        );
      }

      case 'dimensao': {
        const label = SIZES.find((s) => s.size === size)?.label ?? (size ? size : SIZES[0].label);
        if (dim) return <Text>{label}</Text>;
        return (
          <Box flexDirection="column">
            {SIZES.map((s, i) => {
              const cur = i === sizeCursor;
              return (
                <Text key={s.label} bold={cur} color={cur ? theme.primary : undefined} backgroundColor={cur ? theme.accent : undefined}>
                  {truncate(s.label, COL_W - 2)}
                </Text>
              );
            })}
            <Text color={theme.dim}>sob codex o tamanho é uma dica</Text>
          </Box>
        );
      }

      case 'workers': {
        const label = workers === 0 ? 'todos de uma vez' : `${workers} por vez`;
        if (dim) return <Text>{label}</Text>;
        return (
          <Box flexDirection="column">
            <Text bold color={theme.ok}>{label}</Text>
            <Text color={theme.dim}>↑↓ ou +/- ajusta · dígito define</Text>
            <Text color={theme.dim}>0 dispara todas as imagens simultaneamente</Text>
          </Box>
        );
      }

      case 'juizes': {
        if (dim) {
          return (
            <Box flexDirection="column">
              <Text bold color={theme.ok}>{judges.length} votante(s)</Text>
              {judges.map((j) => (
                <Text key={judgeKey(j)} color={theme.dim}>· {truncate(j.label, COL_W - 3)}</Text>
              ))}
            </Box>
          );
        }
        return (
          <Box flexDirection="column">
            <Text color={theme.dim}>espaço marca quem vota</Text>
            {pool.map((j, i) => {
              const cur = i === judgeCursor;
              const on = judgeOn(j);
              return (
                <Box key={judgeKey(j)}>
                  <Text color={on ? theme.ok : theme.dim}>{on ? '[x] ' : '[ ] '}</Text>
                  <Text bold={cur} color={cur ? theme.primary : undefined} backgroundColor={cur ? theme.accent : undefined}>
                    {truncate(j.label, COL_W - 6)}
                  </Text>
                </Box>
              );
            })}
            <Text color={theme.dim}>{judges.length > 1 ? 'painel: média dos votos' : 'juiz único'}</Text>
          </Box>
        );
      }

      case 'evitar':
        return isActive ? (
          <Box flexDirection="column">
            <TextInput value={avoid} onChange={setAvoid} placeholder="texto, marca d'água…" />
            <Text color={theme.dim}>Enter avança (vazio = nenhum)</Text>
          </Box>
        ) : (
          <Text color={avoid ? undefined : theme.dim}>{avoid ? truncate(avoid, 60) : '—'}</Text>
        );

      case 'refs':
        return isActive ? (
          <Box flexDirection="column">
            <TextInput value={refs} onChange={setRefs} placeholder="/abs/ref.png, …" />
            <Text color={theme.dim}>Enter GERA · Tab volta</Text>
          </Box>
        ) : (
          <Text color={refs ? undefined : theme.dim}>{refs ? truncate(refs, 60) : '—'}</Text>
        );

      case 'gerar':
        return (
          <Box flexDirection="column">
            <Text bold color={theme.ok}>{total} imagem(ns)</Text>
            <Text color={theme.dim}>{selected.length} estilo(s)</Text>
            <Text color={theme.dim}>{workers === 0 ? 'todas de uma vez' : `${workers} por vez`}</Text>
            <Text color={theme.dim}>{judges.length} juiz(es)</Text>
            <Box marginTop={1}>
              <Text bold color={isActive ? theme.primary : theme.dim} backgroundColor={isActive ? theme.accent : undefined}>
                {' Enter = gerar '}
              </Text>
            </Box>
          </Box>
        );
    }
  }

  // Janela horizontal de colunas conforme a largura do terminal.
  const width = stdout?.columns ?? 120;
  const perView = Math.max(2, Math.min(COLS.length, Math.floor(width / (COL_W + 2))));
  const startCol = Math.min(Math.max(0, col - Math.floor(perView / 2)), Math.max(0, COLS.length - perView));
  const cols = COLS.slice(startCol, startCol + perView);

  return (
    <Box flexDirection="column">
      <Box>
        {startCol > 0 ? <Text color={theme.dim}>‹ </Text> : null}
        {cols.map((c) => {
          const i = COLS.findIndex((x) => x.id === c.id);
          const isActive = i === col;
          return (
            <Box key={c.id} flexDirection="column" width={COL_W} marginRight={2}>
              <Text bold color={isActive ? theme.accent : theme.dim}>
                {truncate(c.title, COL_W)}
              </Text>
              <Box marginTop={1} flexDirection="column">
                {renderCol(c.id, isActive)}
              </Box>
            </Box>
          );
        })}
        {startCol + perView < COLS.length ? <Text color={theme.dim}> ›</Text> : null}
      </Box>
      {warn ? (
        <Box marginTop={1}>
          <Text color={theme.warn}>{warn}</Text>
        </Box>
      ) : null}
    </Box>
  );
}
