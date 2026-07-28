import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../theme';

/** Lista de linhas de log/erro; mostra apenas a cauda (últimas `max`). */
export function Messages({
  lines,
  title,
  color,
  max = 14,
}: {
  lines: string[];
  title?: string;
  color?: string;
  max?: number;
}) {
  const shown = lines.slice(-max);
  return (
    <Box flexDirection="column">
      {title ? (
        <Text bold color={color ?? theme.err}>
          {title}
        </Text>
      ) : null}
      {shown.map((l, i) => (
        <Text key={i} color={color ?? theme.dim}>
          {l}
        </Text>
      ))}
    </Box>
  );
}
