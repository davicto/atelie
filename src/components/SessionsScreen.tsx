import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { theme } from '../theme';
import { listSessions } from '../lib/sessions';
import type { SessionSummary } from '../types';

function pad(s: string, w: number): string {
  const v = s ?? '';
  return v.length >= w ? v.slice(0, w) : v + ' '.repeat(w - v.length);
}

function shortDate(iso: string): string {
  try {
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
  } catch {
    return iso;
  }
}

/** Lista as sessões passadas; Enter abre o detalhe. */
export function SessionsScreen({ onOpen, onBack }: { onOpen: (id: string) => void; onBack: () => void }) {
  const [list] = useState<SessionSummary[]>(() => listSessions());
  const [cursor, setCursor] = useState(0);

  useInput((input, key) => {
    if (key.escape || input === 'q') {
      onBack();
      return;
    }
    if (!list.length) return;
    if (key.upArrow || input === 'k') setCursor((c) => (c - 1 + list.length) % list.length);
    else if (key.downArrow || input === 'j') setCursor((c) => (c + 1) % list.length);
    else if (key.return) onOpen(list[cursor].id);
  });

  return (
    <Box flexDirection="column">
      <Text bold color={theme.accent}>
        Sessões ({list.length})
      </Text>
      {!list.length ? (
        <Box marginTop={1}>
          <Text color={theme.dim}>Nenhuma sessão ainda. Use "Criar" no menu. (q volta)</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          <Text color={theme.dim}>{pad('  data', 14) + pad('img', 5) + pad('nota', 6) + pad('tempo', 8) + 'pedido'}</Text>
          {list.map((s, i) => {
            const active = i === cursor;
            const nota = s.bestNota != null ? String(s.bestNota) : '—';
            const dur = s.durationMs != null ? `${(s.durationMs / 1000).toFixed(0)}s` : '—';
            return (
              <Box key={s.id}>
                <Text
                  bold={active}
                  color={active ? theme.primary : undefined}
                  backgroundColor={active ? theme.accent : undefined}
                >
                  {pad((active ? '› ' : '  ') + shortDate(s.createdAt), 14)}
                </Text>
                <Text>{pad(String(s.imageCount), 5)}</Text>
                <Text color={theme.primaryLight}>{pad(nota, 6)}</Text>
                <Text color={theme.dim}>{pad(dur, 8)}</Text>
                <Text wrap="truncate-end">{s.request}</Text>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
