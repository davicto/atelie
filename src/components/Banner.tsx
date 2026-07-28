import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../theme';

export function Banner({ subtitle }: { subtitle?: string }) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color={theme.accent}>
        ATELIÊ
      </Text>
      <Text color={theme.dim}>{subtitle ?? 'esteira de geração com juiz Claude'}</Text>
    </Box>
  );
}
