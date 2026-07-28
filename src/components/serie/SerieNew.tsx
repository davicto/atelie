import React, { useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import TextInput from 'ink-text-input';
import { theme } from '../../theme';
import { getAllStyles } from '../../lib/userStyles';
import { draftCanon } from '../../lib/serie/canon';
import { StyleGallery } from '../StyleGallery';
import { Timer } from '../Timer';
import type { Canon } from '../../types';

type Phase = 'titulo' | 'desc' | 'estilo' | 'drafting' | 'review' | 'error';

// Linhas editáveis do cânone (campos livres + nome/descrição de cada personagem).
type Row =
  | { kind: 'style' }
  | { kind: 'paleta' }
  | { kind: 'mundo' }
  | { kind: 'pnome'; i: number }
  | { kind: 'pdesc'; i: number };

function buildRows(canon: Canon): Row[] {
  const rows: Row[] = [{ kind: 'style' }, { kind: 'paleta' }, { kind: 'mundo' }];
  canon.personagens.forEach((_, i) => {
    rows.push({ kind: 'pnome', i });
    rows.push({ kind: 'pdesc', i });
  });
  return rows;
}

function rowLabel(r: Row): string {
  if (r.kind === 'style') return 'Estilo';
  if (r.kind === 'paleta') return 'Paleta';
  if (r.kind === 'mundo') return 'Mundo';
  if (r.kind === 'pnome') return `Personagem ${r.i + 1} · nome`;
  return `Personagem ${r.i + 1} · descrição`;
}

function rowValue(canon: Canon, r: Row): string {
  if (r.kind === 'style') return canon.estiloDescricao ?? '';
  if (r.kind === 'paleta') return canon.paleta ?? '';
  if (r.kind === 'mundo') return canon.mundo ?? '';
  if (r.kind === 'pnome') return canon.personagens[r.i]?.nome ?? '';
  return canon.personagens[r.i]?.descricao ?? '';
}

function withRowValue(canon: Canon, r: Row, v: string): Canon {
  const next: Canon = { ...canon, personagens: canon.personagens.map((p) => ({ ...p })) };
  if (r.kind === 'style') next.estiloDescricao = v;
  else if (r.kind === 'paleta') next.paleta = v.trim() || undefined;
  else if (r.kind === 'mundo') next.mundo = v.trim() || undefined;
  else if (r.kind === 'pnome' && next.personagens[r.i]) next.personagens[r.i].nome = v.trim() || next.personagens[r.i].nome;
  else if (r.kind === 'pdesc' && next.personagens[r.i]) next.personagens[r.i].descricao = v;
  return next;
}

/**
 * Nova série: título → descrição livre → estilo → draftCanon (Claude) → revisar/editar
 * o cânone (estilo/paleta/mundo + personagens) → confirmar. Ao confirmar chama onConfirm
 * com (título, descrição, canon); a persistência fica com o App.
 */
export function SerieNew({
  onConfirm,
  onCancel,
}: {
  onConfirm: (titulo: string, desc: string, canon: Canon) => void;
  onCancel: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('titulo');
  const [titulo, setTitulo] = useState('');
  const [desc, setDesc] = useState('');
  const [estiloId, setEstiloId] = useState('custom');
  const [canon, setCanon] = useState<Canon | null>(null);
  const [cursor, setCursor] = useState(0);
  const [editing, setEditing] = useState(false);
  const [temp, setTemp] = useState('');
  const [startedAt, setStartedAt] = useState(0);
  const [errMsg, setErrMsg] = useState('');

  const descRef = useRef('');
  descRef.current = desc;

  async function runDraft(id: string): Promise<void> {
    setStartedAt(Date.now());
    setPhase('drafting');
    try {
      const c = await draftCanon(descRef.current, id, {});
      setCanon(c);
      setCursor(0);
      setPhase('review');
    } catch (e: any) {
      setErrMsg(String(e?.message ?? e));
      setPhase('error');
    }
  }

  function onStyles(ids: string[]): void {
    const id = ids[0] ?? 'custom';
    setEstiloId(id);
    void runDraft(id);
  }

  const rows = canon ? buildRows(canon) : [];
  const cur = rows[cursor];

  function startEdit(): void {
    if (!cur || !canon) return;
    setTemp(rowValue(canon, cur));
    setEditing(true);
  }
  function commitEdit(): void {
    if (canon && cur) setCanon(withRowValue(canon, cur, temp));
    setEditing(false);
  }

  // Review: navegação + comandos (c confirma, r regenera). Desativado ao editar texto.
  useInput(
    (input, key) => {
      if (phase !== 'review' || !canon) return;
      if (key.upArrow || input === 'k') setCursor((c) => (c - 1 + rows.length) % rows.length);
      else if (key.downArrow || input === 'j') setCursor((c) => (c + 1) % rows.length);
      else if (key.return) startEdit();
      else if (input === 'c') {
        if (!canon.personagens.length) {
          setErrMsg('cânone sem personagens — não dá para ancorar. Regenere (r) ou volte (Esc).');
          return;
        }
        onConfirm(titulo.trim(), desc.trim(), canon);
      } else if (input === 'r') void runDraft(estiloId);
      else if (key.escape || input === 'q') onCancel();
    },
    { isActive: phase === 'review' && !editing },
  );

  useInput(
    (_input, key) => {
      if (key.escape) setEditing(false);
    },
    { isActive: editing },
  );

  // Esc global das fases de formulário/erro (não durante edição de cânone).
  useInput(
    (_input, key) => {
      if (phase === 'titulo' || phase === 'desc') {
        if (key.escape) onCancel();
      } else if (phase === 'error') {
        if (key.return || key.escape) setPhase('review');
      }
    },
    { isActive: phase === 'titulo' || phase === 'desc' || phase === 'error' },
  );

  if (phase === 'titulo') {
    return (
      <Box flexDirection="column">
        <Text bold color={theme.accent}>
          Nova série · título
        </Text>
        <Text color={theme.dim}>Um nome curto para a série (HQ, storyboard, livro). Enter avança · Esc cancela.</Text>
        <Box marginTop={1}>
          <Text color={theme.primaryLight}>{'› '}</Text>
          <TextInput
            value={titulo}
            onChange={setTitulo}
            onSubmit={(v) => v.trim() && setPhase('desc')}
            placeholder="ex.: Aventuras da Mia"
          />
        </Box>
      </Box>
    );
  }

  if (phase === 'desc') {
    return (
      <Box flexDirection="column">
        <Text bold color={theme.accent}>
          Nova série · descrição
        </Text>
        <Text color={theme.dim}>
          Descreva a história, os personagens e o mundo em linguagem livre. Claude montará a bíblia (cânone).
        </Text>
        <Box marginTop={1}>
          <Text color={theme.primaryLight}>{'› '}</Text>
          <TextInput
            value={desc}
            onChange={setDesc}
            onSubmit={(v) => v.trim() && setPhase('estilo')}
            placeholder="ex.: Mia, uma gatinha de óculos redondos, explora uma vila medieval com seu amigo corvo…"
          />
        </Box>
      </Box>
    );
  }

  if (phase === 'estilo') {
    return (
      <Box flexDirection="column">
        <Text bold color={theme.accent}>
          Nova série · estilo (escolha um; o 1º marcado é usado)
        </Text>
        <StyleGallery styles={getAllStyles()} onConfirm={onStyles} />
      </Box>
    );
  }

  if (phase === 'drafting') {
    return (
      <Box flexDirection="column">
        <Box>
          <Text color={theme.accent}>
            <Spinner type="dots" />
          </Text>
          <Text> Claude montando a bíblia… </Text>
          <Timer startedAt={startedAt} running />
        </Box>
        <Text color={theme.dim}>Extraindo personagens (travas visuais), estilo e mundo/paleta da sua descrição.</Text>
      </Box>
    );
  }

  if (phase === 'error') {
    return (
      <Box flexDirection="column">
        <Text bold color={theme.err}>
          Falha ao montar o cânone
        </Text>
        <Text wrap="wrap">{errMsg}</Text>
        <Text color={theme.dim}>Enter/Esc volta à revisão.</Text>
      </Box>
    );
  }

  // phase === 'review'
  if (!canon) return null;
  return (
    <Box flexDirection="column">
      <Text bold color={theme.accent}>
        Cânone de "{titulo}" — revise e edite
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {rows.map((r, i) => {
          const active = i === cursor;
          const editingHere = active && editing;
          return (
            <Box key={`${r.kind}-${'i' in r ? r.i : ''}`}>
              <Text
                bold={active}
                color={active ? theme.primary : undefined}
                backgroundColor={active ? theme.accent : undefined}
              >
                {' ' + (active ? '›' : ' ') + ' ' + rowLabel(r) + ' '}
              </Text>
              <Text> </Text>
              {editingHere ? (
                <TextInput value={temp} onChange={setTemp} onSubmit={commitEdit} focus />
              ) : (
                <Text color={theme.ok} wrap="truncate-end">
                  {rowValue(canon, r) || '(vazio)'}
                </Text>
              )}
            </Box>
          );
        })}
      </Box>
      {errMsg ? (
        <Box marginTop={1}>
          <Text color={theme.warn} wrap="wrap">
            {errMsg}
          </Text>
        </Box>
      ) : null}
      <Box marginTop={1}>
        <Text color={theme.dim}>
          {canon.personagens.length} personagem(ns) · Enter edita · c confirma (→ âncoras) · r regenera cânone · Esc cancela
        </Text>
      </Box>
    </Box>
  );
}
