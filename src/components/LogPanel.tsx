import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../theme';
import type { LogEntry } from '../types';

const levelColor: Record<LogEntry['level'], string> = {
  info: theme.dim,
  ok: theme.ok,
  warn: theme.warn,
  err: theme.err,
};

/** Log ao vivo: mostra a cauda (últimas `max`) do buffer do SessionLogger. */
export function LogPanel({ entries, max = 10, title }: { entries: LogEntry[]; max?: number; title?: string }) {
  const shown = entries.slice(-max);
  return (
    <Box flexDirection="column" marginTop={1}>
      {title ? (
        <Text bold color={theme.primaryLight}>
          {title}
        </Text>
      ) : null}
      {shown.length === 0 ? <Text color={theme.dim}>(sem eventos ainda)</Text> : null}
      {shown.map((e, i) => (
        <Text key={i} color={levelColor[e.level]} wrap="truncate-end">
          {`[+${(e.elapsedMs / 1000).toFixed(1)}s] ${e.msg}`}
        </Text>
      ))}
    </Box>
  );
}
