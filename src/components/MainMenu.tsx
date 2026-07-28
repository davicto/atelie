import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { theme } from '../theme';

export type MenuItem = 'criar' | 'serie' | 'sessions' | 'add_style' | 'config' | 'sair';

const ITEMS: { id: MenuItem; label: string; desc: string }[] = [
  { id: 'criar', label: 'Criar', desc: 'Gerar imagens a partir de um pedido em linguagem natural' },
  { id: 'serie', label: 'Série', desc: 'Sequências coerentes (HQ, storyboard, livro): personagem/estilo consistente entre quadros' },
  { id: 'sessions', label: 'Sessões', desc: 'Ver, reavaliar e continuar gerações anteriores' },
  { id: 'add_style', label: 'Adicionar estilo', desc: 'Claude propõe um StyleDef a partir da sua descrição/imagens' },
  { id: 'config', label: 'Configurações', desc: 'Modelo do juiz, concorrência, qualidade, viewer…' },
  { id: 'sair', label: 'Sair', desc: 'Encerrar o Ateliê' },
];

/** Menu inicial navegável. Item ativo destacado por cor/fundo/negrito. */
export function MainMenu({ onSelect }: { onSelect: (id: MenuItem) => void }) {
  const [cursor, setCursor] = useState(0);

  useInput((input, key) => {
    if (key.upArrow || input === 'k') setCursor((c) => (c - 1 + ITEMS.length) % ITEMS.length);
    else if (key.downArrow || input === 'j') setCursor((c) => (c + 1) % ITEMS.length);
    else if (key.return) onSelect(ITEMS[cursor].id);
  });

  return (
    <Box flexDirection="column">
      <Text bold color={theme.accent}>
        Menu
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {ITEMS.map((it, i) => {
          const active = i === cursor;
          return (
            <Text
              key={it.id}
              bold={active}
              color={active ? theme.primary : undefined}
              backgroundColor={active ? theme.accent : undefined}
            >
              {' ' + (active ? '›' : ' ') + ' ' + it.label + ' '}
            </Text>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <Text color={theme.dim}>{ITEMS[cursor].desc}</Text>
      </Box>
    </Box>
  );
}
