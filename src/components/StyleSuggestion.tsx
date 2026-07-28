import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../theme';
import type { StyleDef } from '../styles/catalog.types';

function Row({ k, v }: { k: string; v: string }) {
  return (
    <Box>
      <Text color={theme.dim}>{k + ': '}</Text>
      <Text bold>{v}</Text>
    </Box>
  );
}

/** Mostra o StyleDef proposto pelo Claude, COMPLETO (template com wrap, sem corte). */
export function StyleSuggestion({ style }: { style: StyleDef; raw?: string }) {
  return (
    <Box flexDirection="column">
      <Text bold color={theme.accent}>
        StyleDef sugerido
      </Text>
      <Box flexDirection="column" marginTop={1}>
        <Row k="nome" v={style.nome} />
        <Row k="id" v={style.id} />
        <Row k="grupo" v={style.grupo} />
        <Box flexDirection="column" marginTop={1}>
          <Text color={theme.dim}>desc</Text>
          <Text wrap="wrap">{style.desc}</Text>
        </Box>
        <Box flexDirection="column" marginTop={1}>
          <Text color={theme.dim}>template</Text>
          <Text wrap="wrap">{style.template}</Text>
        </Box>
        <Box marginTop={1}>
          <Text color={theme.dim}>defaults: </Text>
          <Text>{JSON.stringify(style.defaults)}</Text>
        </Box>
      </Box>
    </Box>
  );
}
