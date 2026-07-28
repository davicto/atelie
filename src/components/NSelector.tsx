import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { theme } from '../theme';

const MIN = 1;
const MAX = 12;

/** Stepper de N: ↑/↓ ou →/← e +/- ajustam; dígito define (0 = 10); Enter confirma. */
export function NSelector({ initial, onConfirm }: { initial: number; onConfirm: (n: number) => void }) {
  const [n, setN] = useState(Math.min(MAX, Math.max(MIN, initial)));

  useInput((input, key) => {
    if (key.upArrow || key.rightArrow || input === '+' || input === 'k' || input === 'l') {
      setN((v) => Math.min(MAX, v + 1));
    } else if (key.downArrow || key.leftArrow || input === '-' || input === 'j' || input === 'h') {
      setN((v) => Math.max(MIN, v - 1));
    } else if (/^[0-9]$/.test(input)) {
      const d = Number(input);
      setN(Math.min(MAX, Math.max(MIN, d === 0 ? 10 : d)));
    } else if (key.return) {
      onConfirm(n);
    }
  });

  return (
    <Box flexDirection="column">
      <Text bold color={theme.accent}>
        Quantas versões gerar?
      </Text>
      <Text color={theme.dim}>↑/↓ ou +/- ajusta · dígito define · Enter confirma ({MIN}–{MAX})</Text>
      <Box marginTop={1}>
        <Text>N = </Text>
        <Text bold color={theme.primary} backgroundColor={theme.accent}>
          {' ' + n + ' '}
        </Text>
      </Box>
    </Box>
  );
}
