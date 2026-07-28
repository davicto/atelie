import React, { useEffect, useState } from 'react';
import { Text } from 'ink';
import { theme } from '../theme';

function fmt(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Cronômetro mm:ss que reconta 1×/s enquanto `running`. */
export function Timer({ startedAt, running, label }: { startedAt: number; running: boolean; label?: string }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [running]);
  return (
    <Text color={theme.accent} bold>
      {(label ?? 'tempo') + ' ' + fmt(Date.now() - startedAt)}
    </Text>
  );
}
