import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { theme } from '../theme';
import type { GenJob } from '../types';

type Prog = { percent: number; phase: string; message: string };

function pad(s: string, w: number): string {
  const v = s ?? '';
  return v.length >= w ? v.slice(0, w) : v + ' '.repeat(w - v.length);
}

function trunc(s: string, w: number): string {
  if (!s) return '';
  return s.length > w ? s.slice(0, w - 1) + '…' : s;
}

function bar(pct: number, width = 16): string {
  const f = Math.max(0, Math.min(width, Math.round((pct / 100) * width)));
  return '█'.repeat(f) + '░'.repeat(width - f);
}

export function ProgressPanel({ jobs, progress }: { jobs: GenJob[]; progress: Record<string, Prog> }) {
  return (
    <Box flexDirection="column">
      {jobs.map((job) => {
        const p = progress[job.id] ?? { percent: 0, phase: 'fila', message: '' };
        const err = p.phase === 'erro';
        const done = p.percent >= 100;
        return (
          <Box key={job.id}>
            <Box width={3}>
              {done || err ? (
                <Text color={err ? theme.err : theme.ok}>{err ? '✗' : '✓'}</Text>
              ) : (
                <Text color={theme.accent}>
                  <Spinner type="dots" />
                </Text>
              )}
            </Box>
            <Text>{pad(job.styleId, 18)}</Text>
            <Text color={theme.primaryLight}>{bar(p.percent)}</Text>
            <Text>{' ' + String(p.percent).padStart(3) + '% '}</Text>
            <Text color={theme.dim}>{trunc(`${p.phase} ${p.message}`.trim(), 30)}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
