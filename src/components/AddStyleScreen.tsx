import React, { useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import TextInput from 'ink-text-input';
import { theme } from '../theme';
import { generateStyleDef } from '../lib/styleGenerator';
import { saveUserStyle, slugify, isKebab } from '../lib/userStyles';
import type { StyleDef } from '../styles/catalog.types';
import { StyleSuggestion } from './StyleSuggestion';
import { Timer } from './Timer';

type Phase = 'form' | 'analyzing' | 'suggestion' | 'saved' | 'error';

const PLACEHOLDERS = [
  'ex.: aquarela noturna com respingos de neon',
  'ex.: /ref/a.png, /ref/b.jpg (opcional)',
  'ex.: /ref/moodboard.md (opcional)',
];
const LABELS = ['descrição do estilo', 'imagens (caminhos, vírgula)', 'arquivos (caminhos, vírgula)'];

function split(v: string): string[] {
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * Adicionar estilo: descrição + caminhos → generateStyleDef (Claude) → mostra o
 * StyleDef sugerido COMPLETO; permite editar id/nome, Salvar, Regenerar ou cancelar.
 */
export function AddStyleScreen({ onDone }: { onDone: (saved: boolean) => void }) {
  const [phase, setPhase] = useState<Phase>('form');
  const [descricao, setDescricao] = useState('');
  const [imagens, setImagens] = useState('');
  const [arquivos, setArquivos] = useState('');
  const [focus, setFocus] = useState(0);
  const [warn, setWarn] = useState('');
  const [draft, setDraft] = useState<StyleDef | null>(null);
  const [editing, setEditing] = useState<'id' | 'nome' | null>(null);
  const [editVal, setEditVal] = useState('');
  const [errMsg, setErrMsg] = useState('');
  const [startedAt, setStartedAt] = useState(0);

  const inputsRef = useRef({ descricao, imagens, arquivos });
  inputsRef.current = { descricao, imagens, arquivos };

  async function analyze() {
    const cur = inputsRef.current;
    if (!cur.descricao.trim()) {
      setWarn('Descreva o estilo antes de gerar.');
      setFocus(0);
      return;
    }
    setWarn('');
    setStartedAt(Date.now());
    setPhase('analyzing');
    try {
      const { style } = await generateStyleDef({
        descricao: cur.descricao,
        imagens: split(cur.imagens),
        arquivos: split(cur.arquivos),
      });
      setDraft(style);
      setPhase('suggestion');
    } catch (e: any) {
      setErrMsg(String(e?.message ?? e));
      setPhase('error');
    }
  }

  function doSave() {
    if (!draft) return;
    if (!isKebab(draft.id)) {
      setErrMsg(`id inválido (kebab-case): "${draft.id}"`);
      return;
    }
    try {
      saveUserStyle(draft);
      setErrMsg('');
      setPhase('saved');
    } catch (e: any) {
      setErrMsg(String(e?.message ?? e));
    }
  }

  function commitEdit() {
    if (!draft || !editing) {
      setEditing(null);
      return;
    }
    if (editing === 'id') setDraft({ ...draft, id: slugify(editVal) });
    else setDraft({ ...draft, nome: editVal.trim() || draft.nome });
    setEditing(null);
  }

  // Input principal (desativado durante edição de campo).
  useInput(
    (input, key) => {
      if (phase === 'form') {
        if (key.upArrow) setFocus((f) => (f - 1 + 3) % 3);
        else if (key.downArrow) setFocus((f) => (f + 1) % 3);
        else if (key.escape) onDone(false);
        return;
      }
      if (phase === 'analyzing') return;
      if (phase === 'suggestion') {
        if (key.escape) {
          onDone(false);
          return;
        }
        const c = input.toLowerCase();
        if (c === 'n') {
          setEditVal(draft?.nome ?? '');
          setEditing('nome');
        } else if (c === 'i') {
          setEditVal(draft?.id ?? '');
          setEditing('id');
        } else if (c === 'r') void analyze();
        else if (c === 's') doSave();
        return;
      }
      if (phase === 'error') {
        if (key.return || key.escape) setPhase('form');
        return;
      }
      if (phase === 'saved') {
        if (key.return || key.escape) onDone(true);
      }
    },
    { isActive: !editing },
  );

  // Esc cancela a edição de id/nome.
  useInput(
    (_input, key) => {
      if (key.escape) setEditing(null);
    },
    { isActive: !!editing },
  );

  if (phase === 'analyzing') {
    return (
      <Box flexDirection="column">
        <Box>
          <Text color={theme.accent}>
            <Spinner type="dots" />
          </Text>
          <Text> Claude analisando… </Text>
          <Timer startedAt={startedAt} running />
        </Box>
        <Text color={theme.dim}>Compondo um StyleDef a partir da sua descrição/imagens.</Text>
      </Box>
    );
  }

  if (phase === 'suggestion' && draft) {
    return (
      <Box flexDirection="column">
        <StyleSuggestion style={draft} />
        {editing ? (
          <Box marginTop={1}>
            <Text color={theme.accent}>{editing}: </Text>
            <TextInput value={editVal} onChange={setEditVal} onSubmit={commitEdit} focus />
          </Box>
        ) : null}
        {errMsg ? <Text color={theme.err}>{errMsg}</Text> : null}
        <Box marginTop={1}>
          <Text color={theme.dim}>[n] editar nome · [i] editar id · [s] salvar · [r] regenerar · Esc cancela</Text>
        </Box>
      </Box>
    );
  }

  if (phase === 'saved' && draft) {
    return (
      <Box flexDirection="column">
        <Text bold color={theme.ok}>
          Estilo salvo ✓
        </Text>
        <Text>
          {draft.nome} <Text color={theme.dim}>({draft.id})</Text> já aparece em "Criar".
        </Text>
        <Text color={theme.dim}>Enter volta ao menu.</Text>
      </Box>
    );
  }

  if (phase === 'error') {
    return (
      <Box flexDirection="column">
        <Text bold color={theme.err}>
          Falha ao gerar o estilo
        </Text>
        <Text wrap="wrap">{errMsg}</Text>
        <Text color={theme.dim}>Enter tenta de novo · Esc volta.</Text>
      </Box>
    );
  }

  // phase === 'form'
  const values = [descricao, imagens, arquivos];
  const setters = [setDescricao, setImagens, setArquivos];
  return (
    <Box flexDirection="column">
      <Text bold color={theme.accent}>
        Adicionar estilo
      </Text>
      <Text color={theme.dim}>
        Descreva o estilo; opcionalmente aponte imagens/arquivos de referência. Claude proporá um StyleDef.
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {LABELS.map((label, i) => (
          <Box key={label}>
            <Text bold={focus === i} color={focus === i ? theme.accent : theme.dim}>
              {(focus === i ? '› ' : '  ') + label + ': '}
            </Text>
            <TextInput
              value={values[i]}
              onChange={setters[i]}
              focus={focus === i}
              placeholder={PLACEHOLDERS[i]}
              onSubmit={() => (i < 2 ? setFocus(i + 1) : void analyze())}
            />
          </Box>
        ))}
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.dim}>↑↓ troca campo · Enter avança (no último, gera) · Esc cancela</Text>
        {warn ? <Text color={theme.warn}>{warn}</Text> : null}
      </Box>
    </Box>
  );
}
