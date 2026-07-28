import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { theme } from '../theme';
import type { StyleDef } from '../styles/catalog.types';

type Row =
  | { kind: 'header'; label: string }
  | { kind: 'style'; style: StyleDef; si: number };

const WIN = 16;

/**
 * Multi-seleção hand-rolled (Ink 5 não tem ink-multi-select estável).
 * ↑↓ move o cursor, espaço marca/desmarca, Enter confirma (≥1 obrigatório).
 * Destaque do item ativo por fundo/cor/negrito — nunca por barra lateral.
 */
export function StyleGallery({ styles, onConfirm }: { styles: StyleDef[]; onConfirm: (ids: string[]) => void }) {
  const [cursor, setCursor] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [warn, setWarn] = useState(false);

  useInput((input, key) => {
    if (key.upArrow || input === 'k') {
      setCursor((c) => (c - 1 + styles.length) % styles.length);
    } else if (key.downArrow || input === 'j') {
      setCursor((c) => (c + 1) % styles.length);
    } else if (input === ' ') {
      const id = styles[cursor].id;
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      setWarn(false);
    } else if (key.return) {
      if (selected.size >= 1) onConfirm([...selected]);
      else setWarn(true);
    }
  });

  // Constrói linhas (cabeçalhos de grupo + estilos) para janela de rolagem.
  const rows: Row[] = [];
  let lastGroup = '';
  styles.forEach((style, si) => {
    if (style.grupo !== lastGroup) {
      rows.push({ kind: 'header', label: style.grupo });
      lastGroup = style.grupo;
    }
    rows.push({ kind: 'style', style, si });
  });

  const cursorRow = rows.findIndex((r) => r.kind === 'style' && r.si === cursor);
  let start = 0;
  if (rows.length > WIN) {
    start = Math.min(Math.max(0, cursorRow - Math.floor(WIN / 2)), rows.length - WIN);
  }
  const view = rows.slice(start, start + WIN);
  const active = styles[cursor];

  return (
    <Box flexDirection="column">
      <Text bold color={theme.accent}>
        Escolha um ou mais estilos ({selected.size} selecionado{selected.size === 1 ? '' : 's'})
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {start > 0 ? <Text color={theme.dim}>↑ mais acima</Text> : null}
        {view.map((r, i) => {
          if (r.kind === 'header') {
            return (
              <Text key={`h-${i}`} bold color={theme.primaryLight}>
                {r.label}
              </Text>
            );
          }
          const isActive = r.si === cursor;
          const marker = selected.has(r.style.id) ? '[x]' : '[ ]';
          const markerColor = selected.has(r.style.id) ? theme.ok : theme.dim;
          return (
            <Box key={`s-${r.style.id}`}>
              <Text color={markerColor}>{'  ' + marker + ' '}</Text>
              <Text
                bold={isActive}
                color={isActive ? theme.primary : undefined}
                backgroundColor={isActive ? theme.accent : undefined}
              >
                {' ' + r.style.nome + ' '}
              </Text>
            </Box>
          );
        })}
        {start + WIN < rows.length ? <Text color={theme.dim}>↓ mais abaixo</Text> : null}
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.dim}>{active?.desc ?? ''}</Text>
        {warn ? <Text color={theme.warn}>Selecione ao menos um estilo (espaço marca).</Text> : null}
      </Box>
    </Box>
  );
}
