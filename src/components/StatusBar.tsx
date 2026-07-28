import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../theme';

/** Rodapé com atalhos contextuais (por tela). `context` = estado à esquerda. */
export function StatusBar({ hints, context }: { hints: string; context?: string }) {
  return (
    <Box marginTop={1}>
      <Text color={theme.dim}>{(context ? context + ' · ' : '') + hints}</Text>
    </Box>
  );
}
