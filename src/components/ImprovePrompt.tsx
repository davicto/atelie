import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { theme } from '../theme';
import type { JobResult } from '../types';

/**
 * Mostra o veredito do melhor resultado e pergunta se deve melhorar.
 * Fluxo em dois passos: s/n; se sim, escolhe o modo g (regerar) / e (editar).
 */
export function ImprovePrompt({
  best,
  onDecide,
}: {
  best: JobResult;
  onDecide: (d: { improve: boolean; mode: 'generate' | 'edit' }) => void;
}) {
  const [phase, setPhase] = useState<'ask' | 'mode'>('ask');
  const v = best.verdict;

  useInput((input, key) => {
    const c = input.toLowerCase();
    if (phase === 'ask') {
      if (c === 's' || c === 'y') setPhase('mode');
      else if (c === 'n') onDecide({ improve: false, mode: 'generate' });
    } else {
      if (c === 'g') onDecide({ improve: true, mode: 'generate' });
      else if (c === 'e') onDecide({ improve: true, mode: 'edit' });
      else if (key.escape) setPhase('ask');
    }
  });

  return (
    <Box flexDirection="column">
      <Text bold color={theme.accent}>
        Melhoria sugerida pelo juiz
      </Text>
      <Box flexDirection="column" marginTop={1} marginBottom={1}>
        <Text color={theme.dim}>alinhamento</Text>
        <Text wrap="wrap">{v?.alinhamento || '—'}</Text>
        <Text color={theme.dim}>sugestão</Text>
        <Text color={theme.warn} wrap="wrap">
          {v?.sugestao_melhoria || '—'}
        </Text>
        <Text color={theme.dim}>prompt sugerido</Text>
        <Text wrap="wrap">{v?.prompt_sugerido || '—'}</Text>
      </Box>
      {phase === 'ask' ? (
        <Text bold>
          Deseja melhorar? <Text color={theme.ok}>[s]</Text> sim <Text color={theme.err}>[n]</Text> não
        </Text>
      ) : (
        <Text bold>
          Modo: <Text color={theme.accent}>[g]</Text> regerar do zero{'  '}
          <Text color={theme.accent}>[e]</Text> editar a imagem-âncora <Text color={theme.dim}>(Esc volta)</Text>
        </Text>
      )}
    </Box>
  );
}
