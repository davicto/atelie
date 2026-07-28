import React, { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { theme } from '../../theme';
import { buildSerieContactSheet } from '../../lib/serie/contactSheet';
import { readSerieManifest, serieDir } from '../../lib/serie/store';
import { openViewer } from '../../lib/viewer';
import type { Serie } from '../../types';

// Estimativa GROSSEIRA (não é faturamento): imagem codex high ~2K e chamada de juiz.
const IMG_USD = 0.48;
const JUDGE_USD = 0.012;

function fmtDur(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

/** Tempo total pela 1ª e última marca do manifest.jsonl da série. */
function elapsedFromManifest(id: string): number {
  const recs = readSerieManifest(id);
  const ts = recs.map((r) => Date.parse(r?.ts)).filter((n) => Number.isFinite(n));
  if (ts.length < 2) return 0;
  return Math.max(...ts) - Math.min(...ts);
}

/**
 * Visão da série: abre o contact-sheet no navegador ([Abrir galeria]) e mostra
 * custo/tempo estimados (aproximação — não é faturamento).
 */
export function SerieView({ serie, onBack }: { serie: Serie; onBack: () => void }) {
  const [notice, setNotice] = useState('');

  const stats = useMemo(() => {
    const anchors = serie.canon.personagens.filter((p) => p.anchorPng).length;
    const paineis = serie.paineis ?? [];
    const aprovados = paineis.filter((p) => p.aprovado).length;
    const genImages = anchors + paineis.reduce((a, p) => a + (p.tentativas ?? (p.pngPath ? 1 : 0)), 0);
    const judgeCalls = paineis.reduce((a, p) => a + (p.tentativas ?? (p.consistencia != null ? 1 : 0)), 0);
    const usd = genImages * IMG_USD + judgeCalls * JUDGE_USD;
    return {
      anchors,
      paineis: paineis.length,
      aprovados,
      genImages,
      judgeCalls,
      usd: Math.round(usd * 100) / 100,
      durMs: elapsedFromManifest(serie.id),
    };
  }, [serie]);

  function openGallery(): void {
    try {
      const html = buildSerieContactSheet(serie.id);
      openViewer(html);
      setNotice(`galeria aberta: ${html}`);
    } catch (e: any) {
      setNotice(`falha na galeria: ${String(e?.message ?? e)}`);
    }
  }

  useInput((input, key) => {
    if (input === 'g') openGallery();
    else if (input === 'q' || key.escape || key.return) onBack();
  });

  return (
    <Box flexDirection="column">
      <Text bold color={theme.accent}>
        {serie.titulo}
      </Text>
      <Text color={theme.dim}>
        {stats.paineis} painel(is) · {stats.aprovados} aprovado(s) · {stats.anchors} âncora(s)
      </Text>

      <Box marginTop={1}>
        <Text bold color={theme.primaryLight}>
          [Abrir galeria]
        </Text>
        <Text color={theme.dim}> (g) — contact-sheet HTML no navegador</Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Box>
          <Text color={theme.dim}>tempo (manifest): </Text>
          <Text bold>{fmtDur(stats.durMs)}</Text>
        </Box>
        <Box>
          <Text color={theme.dim}>custo estimado: </Text>
          <Text bold>{`~US$ ${stats.usd.toFixed(2)}`}</Text>
          <Text color={theme.dim}>
            {` (${stats.genImages} imagem(ns) + ${stats.judgeCalls} juiz; aprox., não é faturamento)`}
          </Text>
        </Box>
        <Box>
          <Text color={theme.dim}>salva em: </Text>
          <Text wrap="truncate-middle">{serieDir(serie.id)}</Text>
        </Box>
      </Box>

      {notice ? (
        <Box marginTop={1}>
          <Text color={theme.accent} wrap="truncate-end">
            {notice}
          </Text>
        </Box>
      ) : null}

      <Box marginTop={1}>
        <Text color={theme.dim}>g abrir galeria · Enter/q volta</Text>
      </Box>
    </Box>
  );
}
