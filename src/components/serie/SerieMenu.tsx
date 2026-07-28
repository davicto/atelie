import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { theme } from '../../theme';
import { listSeries, type SerieSummary } from '../../lib/serie/store';

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

/**
 * Menu da modalidade Série: linha "Nova série" no topo + lista das séries salvas.
 * Enter na 1ª cria; Enter numa série abre (continuar). Item ativo por cor/fundo/negrito.
 */
export function SerieMenu({
  onNew,
  onOpen,
  onBack,
}: {
  onNew: () => void;
  onOpen: (id: string) => void;
  onBack: () => void;
}) {
  const [list] = useState<SerieSummary[]>(() => listSeries());
  const [cursor, setCursor] = useState(0); // 0 = Nova série; 1..N = list[cursor-1]
  const total = list.length + 1;

  useInput((input, key) => {
    if (key.escape || input === 'q') {
      onBack();
      return;
    }
    if (key.upArrow || input === 'k') setCursor((c) => (c - 1 + total) % total);
    else if (key.downArrow || input === 'j') setCursor((c) => (c + 1) % total);
    else if (key.return) {
      if (cursor === 0) onNew();
      else onOpen(list[cursor - 1].id);
    }
  });

  return (
    <Box flexDirection="column">
      <Text bold color={theme.accent}>
        Série — coerência entre múltiplas imagens
      </Text>

      <Box marginTop={1}>
        <Text
          bold={cursor === 0}
          color={cursor === 0 ? theme.primary : theme.ok}
          backgroundColor={cursor === 0 ? theme.accent : undefined}
        >
          {' ' + (cursor === 0 ? '›' : ' ') + ' + Nova série '}
        </Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text bold color={theme.primaryLight}>
          Séries salvas ({list.length})
        </Text>
        {!list.length ? (
          <Text color={theme.dim}>Nenhuma série ainda.</Text>
        ) : (
          <>
            <Text color={theme.dim}>
              {pad('  data', 14) + pad('pers', 6) + pad('painéis', 9) + 'título'}
            </Text>
            {list.map((s, i) => {
              const active = cursor === i + 1;
              return (
                <Box key={s.id}>
                  <Text
                    bold={active}
                    color={active ? theme.primary : undefined}
                    backgroundColor={active ? theme.accent : undefined}
                  >
                    {pad((active ? '› ' : '  ') + shortDate(s.createdAt), 14)}
                  </Text>
                  <Text>{pad(String(s.personagens), 6)}</Text>
                  <Text color={theme.primaryLight}>{pad(`${s.aprovados}/${s.paineis}`, 9)}</Text>
                  <Text wrap="truncate-end">{s.titulo}</Text>
                </Box>
              );
            })}
          </>
        )}
      </Box>
    </Box>
  );
}
