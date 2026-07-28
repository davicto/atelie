import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { theme } from '../theme';
import { CLAUDE_JUDGE_MODEL, CODEX_JUDGE_MODEL, loadSettings, saveSettings, SETTINGS_FIELDS } from '../lib/settings';
import type { JudgeSpec, Settings } from '../types';

const JUDGE_PROVIDERS: JudgeSpec['provider'][] = ['claude', 'codex'];
const PROVIDER_DEFAULT_MODEL: Record<JudgeSpec['provider'], string> = {
  claude: CLAUDE_JUDGE_MODEL,
  codex: CODEX_JUDGE_MODEL,
};

function clampNumber(key: keyof Settings, val: number): number {
  if (key === 'approveThreshold' || key === 'consistThreshold' || key === 'cenaThreshold') return Math.max(0, Math.min(10, val));
  if (key === 'defaultVersionsPerStyle') return Math.max(1, Math.min(8, val));
  if (key === 'maxTentativas') return Math.max(1, Math.min(8, val));
  if (key === 'concurrency') return Math.max(0, Math.min(64, val)); // 0 = todos de uma vez
  return val;
}

function show(v: Settings[keyof Settings]): string {
  if (v == null) return '(vazio)';
  // Campos booleanos são editados como enum 'sim'/'nao' — exibe no mesmo vocabulário.
  if (typeof v === 'boolean') return v ? 'sim' : 'nao';
  return String(v);
}

/** Valor atual de um campo enum, já no vocabulário das opções. */
function enumValue(v: Settings[keyof Settings], fallback: string): string {
  if (typeof v === 'boolean') return v ? 'sim' : 'nao';
  return v == null ? fallback : String(v);
}

/**
 * Edita SETTINGS_FIELDS (Tab → editor do painel de juízes) e persiste via
 * saveSettings. O painel é multi-provedor: adicionar/remover juízes e trocar
 * provedor+modelo de cada um. Seleção destacada por cor/fundo/negrito.
 */
export function ConfigScreen({ onDone }: { onDone: () => void }) {
  const [vals, setVals] = useState<Settings>(() => loadSettings());
  const [cursor, setCursor] = useState(0);
  const [mode, setMode] = useState<'fields' | 'panel'>('fields');
  const [pcursor, setPcursor] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editTarget, setEditTarget] = useState<'field' | 'panelModel'>('field');
  const [temp, setTemp] = useState('');
  const [saved, setSaved] = useState(false);

  const field = SETTINGS_FIELDS[cursor];
  const panel = vals.judgePanel;
  const serieRow = panel.length; // índice extra (pinado) para editar o juiz da Série
  const onSerieRow = pcursor === serieRow;

  function bump(delta: number) {
    if (field.kind === 'number') {
      setVals((s) => ({ ...s, [field.key]: clampNumber(field.key, Number(s[field.key] ?? 0) + delta) }));
      setSaved(false);
    } else if (field.kind === 'enum' && field.options) {
      const opts = field.options;
      const cur = enumValue(vals[field.key], opts[0]);
      const at = opts.indexOf(cur);
      const idx = ((at < 0 ? 0 : at) + (delta > 0 ? 1 : -1) + opts.length) % opts.length;
      setVals((s) => ({ ...s, [field.key]: opts[idx] as any }));
      setSaved(false);
    }
  }

  function startEditField() {
    if (field.kind !== 'string') return;
    setEditTarget('field');
    setTemp(vals[field.key] == null ? '' : String(vals[field.key]));
    setEditing(true);
  }

  function startEditModel() {
    const cur = onSerieRow ? vals.serieJudge : vals.judgePanel[pcursor];
    if (!cur) return;
    setEditTarget('panelModel');
    setTemp(cur.model);
    setEditing(true);
  }

  function commitEdit() {
    const trimmed = temp.trim();
    if (editTarget === 'field') {
      const next: any = field.key === 'viewerCmd' ? trimmed || null : trimmed;
      setVals((s) => ({ ...s, [field.key]: next }));
    } else {
      setVals((s) => {
        if (pcursor === s.judgePanel.length) {
          const c = s.serieJudge;
          return { ...s, serieJudge: { ...c, model: trimmed || c.model, label: trimmed || c.label } };
        }
        const jp = s.judgePanel.slice();
        const cur = jp[pcursor];
        if (cur) jp[pcursor] = { ...cur, model: trimmed || cur.model, label: trimmed || cur.label };
        return { ...s, judgePanel: jp };
      });
    }
    setEditing(false);
    setSaved(false);
  }

  function addSpec() {
    setPcursor(vals.judgePanel.length);
    setVals((s) => ({ ...s, judgePanel: [...s.judgePanel, { provider: 'claude', model: 'sonnet', label: 'sonnet' }] }));
    setSaved(false);
  }

  function removeSpec() {
    if (onSerieRow) return; // o juiz da Série é fixo (não some do painel)
    setVals((s) => {
      if (s.judgePanel.length <= 1) return s; // manter ≥1 juiz
      const jp = s.judgePanel.slice();
      jp.splice(pcursor, 1);
      return { ...s, judgePanel: jp };
    });
    setPcursor((c) => Math.max(0, Math.min(c, vals.judgePanel.length - 2)));
    setSaved(false);
  }

  function cycleProvider() {
    setVals((s) => {
      if (pcursor === s.judgePanel.length) {
        const cur = s.serieJudge;
        const nextP = JUDGE_PROVIDERS[(JUDGE_PROVIDERS.indexOf(cur.provider) + 1) % JUDGE_PROVIDERS.length];
        const model = PROVIDER_DEFAULT_MODEL[nextP];
        return { ...s, serieJudge: { provider: nextP, model, label: model } };
      }
      const jp = s.judgePanel.slice();
      const cur = jp[pcursor];
      if (!cur) return s;
      const nextP = JUDGE_PROVIDERS[(JUDGE_PROVIDERS.indexOf(cur.provider) + 1) % JUDGE_PROVIDERS.length];
      const model = PROVIDER_DEFAULT_MODEL[nextP];
      jp[pcursor] = { provider: nextP, model, label: model };
      return { ...s, judgePanel: jp };
    });
    setSaved(false);
  }

  function saveAndExit() {
    saveSettings(vals);
    setSaved(true);
    onDone();
  }

  // Navegação dos campos (fields).
  useInput(
    (input, key) => {
      if (key.tab) {
        setMode('panel');
        return;
      }
      if (key.upArrow || input === 'k') setCursor((c) => (c - 1 + SETTINGS_FIELDS.length) % SETTINGS_FIELDS.length);
      else if (key.downArrow || input === 'j') setCursor((c) => (c + 1) % SETTINGS_FIELDS.length);
      else if (key.rightArrow || input === '+' || input === 'l') bump(+1);
      else if (key.leftArrow || input === '-' || input === 'h') bump(-1);
      else if (key.return) startEditField();
      else if (input === 's') saveAndExit();
      else if (key.escape || input === 'q') onDone();
    },
    { isActive: !editing && mode === 'fields' },
  );

  // Navegação do painel de juízes.
  useInput(
    (input, key) => {
      if (key.tab) {
        setMode('fields');
        return;
      }
      const len = panel.length + 1; // +1 = linha fixa do juiz da Série
      if (key.upArrow || input === 'k') setPcursor((c) => (c - 1 + len) % len);
      else if (key.downArrow || input === 'j') setPcursor((c) => (c + 1) % len);
      else if (input === 'a' || input === '+') addSpec();
      else if (input === 'd' || input === '-') removeSpec();
      else if (input === 'p') cycleProvider();
      else if (input === 'm' || key.return) startEditModel();
      else if (input === 's') saveAndExit();
      else if (key.escape || input === 'q') onDone();
    },
    { isActive: !editing && mode === 'panel' },
  );

  // Esc cancela a edição de texto (campo ou modelo).
  useInput(
    (_input, key) => {
      if (key.escape) setEditing(false);
    },
    { isActive: editing },
  );

  return (
    <Box flexDirection="column">
      <Text bold color={theme.accent}>
        Configurações {mode === 'panel' ? '· painel de juízes' : ''}
      </Text>

      {/* Campos simples */}
      <Box flexDirection="column" marginTop={1}>
        {SETTINGS_FIELDS.map((f, i) => {
          const active = mode === 'fields' && i === cursor;
          const editingHere = active && editing && editTarget === 'field';
          return (
            <Box key={f.key}>
              <Text
                bold={active}
                color={active ? theme.primary : undefined}
                backgroundColor={active ? theme.accent : undefined}
              >
                {' ' + (active ? '›' : ' ') + ' ' + f.label + ' '}
              </Text>
              <Text> </Text>
              {editingHere ? (
                <TextInput value={temp} onChange={setTemp} onSubmit={commitEdit} focus />
              ) : (
                <Text color={theme.ok}>{show(vals[f.key])}</Text>
              )}
            </Box>
          );
        })}
      </Box>

      {/* Editor do painel de juízes */}
      <Box flexDirection="column" marginTop={1}>
        <Text bold color={theme.primaryLight}>
          Painel de juízes ({panel.length}) {mode === 'panel' ? '· ativo' : '· Tab p/ editar'}
        </Text>
        {panel.map((spec, i) => {
          const active = mode === 'panel' && i === pcursor;
          const editingHere = active && editing && editTarget === 'panelModel';
          return (
            <Box key={i}>
              <Text
                bold={active}
                color={active ? theme.primary : undefined}
                backgroundColor={active ? theme.accent : undefined}
              >
                {' ' + (active ? '›' : ' ') + ' ' + spec.provider.padEnd(6) + ' '}
              </Text>
              <Text> </Text>
              {editingHere ? (
                <TextInput value={temp} onChange={setTemp} onSubmit={commitEdit} focus />
              ) : (
                <Text color={theme.ok}>{spec.model}</Text>
              )}
            </Box>
          );
        })}
        {/* Juiz de consistência da Série (fixo — não faz parte do painel de consenso) */}
        <Box>
          <Text color={theme.dim}>{'  série · juiz de consistência'}</Text>
        </Box>
        <Box>
          <Text
            bold={onSerieRow && mode === 'panel'}
            color={onSerieRow && mode === 'panel' ? theme.primary : undefined}
            backgroundColor={onSerieRow && mode === 'panel' ? theme.accent : undefined}
          >
            {' ' + (onSerieRow && mode === 'panel' ? '›' : ' ') + ' ' + vals.serieJudge.provider.padEnd(6) + ' '}
          </Text>
          <Text> </Text>
          {onSerieRow && mode === 'panel' && editing && editTarget === 'panelModel' ? (
            <TextInput value={temp} onChange={setTemp} onSubmit={commitEdit} focus />
          ) : (
            <Text color={theme.ok}>{vals.serieJudge.model}</Text>
          )}
        </Box>
      </Box>

      {/* Aviso de custo do painel */}
      <Box marginTop={1}>
        <Text color={vals.judgeMode === 'painel' ? theme.warn : theme.dim} wrap="wrap">
          {vals.judgeMode === 'painel'
            ? `custo: painel = ${panel.length} chamada(s) de juiz por imagem → soma tempo/custo rápido em sessões grandes.`
            : 'modo "único": 1 chamada de juiz por imagem (mais barato/rápido). Tab edita o painel mesmo assim.'}
        </Text>
      </Box>

      {/* Rodapé de atalhos */}
      <Box marginTop={1} flexDirection="column">
        {mode === 'fields' ? (
          <Text color={theme.dim}>
            ↑↓ campo · ←→ (ou +/-) ajusta · Enter edita texto · Tab → painel · s salva · Esc cancela
          </Text>
        ) : (
          <Text color={theme.dim}>↑↓ juiz · p troca provedor · m/Enter edita modelo · a adiciona · d remove · Tab → campos · s salva</Text>
        )}
        {saved ? <Text color={theme.ok}>salvo ✓</Text> : null}
      </Box>
    </Box>
  );
}
