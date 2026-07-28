import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../theme';

/** Prompt composto INTEIRO (sem corte "…") + o prompt sugerido pelo juiz. */
export function PromptView({ title, prompt, suggested }: { title?: string; prompt: string; suggested?: string }) {
  return (
    <Box flexDirection="column">
      <Text bold color={theme.accent}>
        {title ?? 'Prompt completo'}
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.primaryLight}>prompt composto (enviado ao gerador)</Text>
        <Text wrap="wrap">{prompt || '(vazio)'}</Text>
      </Box>
      {suggested ? (
        <Box marginTop={1} flexDirection="column">
          <Text color={theme.primaryLight}>prompt sugerido pelo juiz</Text>
          <Text wrap="wrap">{suggested}</Text>
        </Box>
      ) : null}
    </Box>
  );
}
