import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../theme';
import type { JobResult, PanelVerdict, Verdict } from '../types';
import { findStyle } from '../lib/userStyles';

function isPanel(v?: Verdict | PanelVerdict): v is PanelVerdict {
  return Array.isArray((v as PanelVerdict)?.painel);
}

function pad(s: string, w: number): string {
  const v = s ?? '';
  return v.length >= w ? v.slice(0, w) : v + ' '.repeat(w - v.length);
}

function trunc(s: string, w: number): string {
  if (!s) return '';
  return s.length > w ? s.slice(0, w - 1) + '…' : s;
}

/**
 * Grade de vereditos com linha selecionável: estilo · versão# · nota · ✓/✗ ·
 * trecho do problema · [Visualizar]. A linha selecionada é destacada por
 * cor/fundo/negrito (nunca por barra lateral). Abaixo da grade, o detalhe
 * COMPLETO da linha selecionada é mostrado com wrap (sem corte "…").
 */
export function VerdictGrid({
  results,
  bestIndex,
  selectedIndex,
  favorites = [],
}: {
  results: JobResult[];
  bestIndex: number;
  selectedIndex: number;
  favorites?: string[];
}) {
  const favSet = new Set(favorites);
  const sel = results[selectedIndex];
  return (
    <Box flexDirection="column">
      <Text color={theme.dim}>{pad('  estilo', 20) + pad('ver', 5) + pad('nota', 5) + pad('ok', 3) + pad('problema', 34) + 'ação'}</Text>
      {results.map((r, i) => {
        const style = findStyle(r.job.styleId);
        const nome = style?.nome ?? r.job.styleId;
        const nota = r.verdict?.nota != null ? String(r.verdict.nota) : '—';
        const okMark = !r.ok ? '✗' : r.verdict?.aprovado ? '✓' : '✗';
        const okColor = !r.ok ? theme.err : r.verdict?.aprovado ? theme.ok : theme.err;
        const problema = !r.ok
          ? r.error?.message ?? 'falha na geração'
          : r.verdict?.problemas?.[0] ?? (r.verdict ? '' : '(sem veredito)');
        const isSel = i === selectedIndex;
        const isBest = i === bestIndex;
        const isFav = r.pngPath ? favSet.has(r.pngPath) : false;
        return (
          <Box key={r.job.id}>
            <Text
              bold={isSel}
              color={isSel ? theme.primary : undefined}
              backgroundColor={isSel ? theme.accent : undefined}
            >
              {pad((isSel ? '› ' : '  ') + nome, 20)}
            </Text>
            <Text>{pad('v' + r.job.index, 5)}</Text>
            <Text bold={isBest} color={isBest ? theme.accent : undefined}>
              {pad(nota, 5)}
            </Text>
            <Text color={okColor}>{pad(okMark, 3)}</Text>
            <Text color={theme.dim}>{pad(trunc(problema, 32), 34)}</Text>
            <Text color={isSel ? theme.accent : theme.primaryLight}>[Visualizar]</Text>
            {isFav ? <Text color={theme.ok}> fav</Text> : null}
            {isBest ? <Text color={theme.accent}> ←melhor</Text> : null}
          </Box>
        );
      })}

      {sel?.verdict ? (
        <Box flexDirection="column" marginTop={1}>
          <Text color={theme.primaryLight}>
            detalhe — {findStyle(sel.job.styleId)?.nome ?? sel.job.styleId} v{sel.job.index}
          </Text>
          <Box>
            <Text color={theme.dim}>caminho: </Text>
            <Text wrap="truncate-middle">{sel.pngPath ?? '(não gerado)'}</Text>
          </Box>
          {isPanel(sel.verdict) && sel.verdict.painel.length ? (
            <Box flexWrap="wrap">
              <Text color={theme.dim}>painel: </Text>
              {sel.verdict.painel.map((p, k) => (
                <Text key={k} color={p.verdict.aprovado ? theme.ok : theme.warn}>
                  {p.spec.label} {p.verdict.nota ?? '—'} {p.verdict.aprovado ? '✓' : '✗'}
                  {k < (sel.verdict as PanelVerdict).painel.length - 1 ? '  ' : ''}
                </Text>
              ))}
              <Text color={theme.dim}> · consolidado {sel.verdict.nota ?? '—'}</Text>
            </Box>
          ) : null}
          <Box flexDirection="column">
            <Text color={theme.dim}>alinhamento</Text>
            <Text wrap="wrap">{sel.verdict.alinhamento || '—'}</Text>
          </Box>
          {sel.verdict.problemas.length ? (
            <Box flexDirection="column">
              <Text color={theme.dim}>problemas</Text>
              {sel.verdict.problemas.map((p, k) => (
                <Text key={k} wrap="wrap">
                  {'- ' + p}
                </Text>
              ))}
            </Box>
          ) : null}
          {sel.verdict.sugestao_melhoria ? (
            <Box flexDirection="column">
              <Text color={theme.dim}>sugestão</Text>
              <Text color={theme.warn} wrap="wrap">
                {sel.verdict.sugestao_melhoria}
              </Text>
            </Box>
          ) : null}
        </Box>
      ) : sel && !sel.ok ? (
        <Box marginTop={1}>
          <Text color={theme.err} wrap="wrap">
            erro: {sel.error?.message ?? 'falha na geração'}
          </Text>
        </Box>
      ) : null}
    </Box>
  );
}
