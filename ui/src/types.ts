// Espelha o contrato do servidor local (src/server + src/types.ts). Só o que a UI consome.

export type CliId = 'codex' | 'claude';
export type Capability = 'geração' | 'juiz' | 'add-style' | 'cânone-série';

export interface CliStatus {
  id: CliId;
  nome: string;
  instalada: boolean;
  versao?: string;
  autenticada: boolean;
  detalhe: string;
  remediacao?: string[];
  capacidades: string[];
}
export interface ApiKeyStatus {
  provider: 'openai' | 'anthropic' | 'google';
  presente: boolean;
  origem: 'env' | 'settings' | 'ausente';
}
export interface Environment {
  clis: CliStatus[];
  apiKeys: ApiKeyStatus[];
  authMode: string;
}

export interface StyleInfo {
  id: string;
  nome: string;
  grupo: string;
  desc: string;
  origem: string;
}

export interface ClisResponse {
  enabledClis: Record<CliId, boolean>;
  capabilities: Record<Capability, CliId[]>;
}

export interface SessionSummary {
  id: string;
  createdAt: string;
  request: string;
  styleIds: string[];
  iterations: number;
  imageCount: number;
  bestNota: number | null;
  durationMs?: number;
}

export interface LogEntry {
  ts?: string;
  elapsedMs: number;
  level: 'info' | 'ok' | 'warn' | 'err';
  msg: string;
}
export interface ProgressEvent {
  jobId: string;
  phase: string;
  percent: number;
  message: string;
}

export interface JudgeSpec {
  provider: 'claude' | 'codex';
  model: string;
  label: string;
}

export interface Settings {
  judgeModel: string;
  approveThreshold: number;
  concurrency: number;
  defaultVersionsPerStyle: number;
  defaultQuality: 'low' | 'medium' | 'high';
  viewerCmd: string | null;
  autoOpenFolder: boolean;
  genProvider: 'codex';
  judgeMode: 'painel' | 'unico';
  judgePanel: JudgeSpec[];
  singleJudge: JudgeSpec;
  consistThreshold: number;
  cenaThreshold: number;
  maxTentativas: number;
  incluirAnterior: boolean;
  serieJudge: JudgeSpec;
  authMode: 'cli' | 'apikey' | 'auto';
  openaiApiKey: string | null;
  anthropicApiKey: string | null;
  googleApiKey: string | null;
  enabledClis: { codex: boolean; claude: boolean };
}

// ── Veredito (serializado pelo servidor em /done e no snapshot) ──────────────
export interface PanelVote {
  spec?: { provider: string; model: string; label?: string };
  provider?: string;
  model?: string;
  nota: number | null;
  aprovado?: boolean | null;
  verdict?: { nota: number | null; aprovado: boolean };
}
export interface VerdictJson {
  nota: number | null;
  aprovado: boolean;
  alinhamento: string;
  problemas: string[];
  sugestao_melhoria: string;
  prompt_sugerido: string;
  painel?: PanelVote[] | null;
}

// ── Resultado do run (handleRun → runResultJson) ─────────────────────────────
export interface RunResultItem {
  styleId: string;
  index: number;
  pngPath: string | null;
  ok: boolean;
  verdict: VerdictJson | null;
}
export interface RunIteration {
  iteration: number;
  durationMs: number;
  results: RunResultItem[];
  best: { styleId: string; index: number; pngPath: string | null; nota: number | null } | null;
}
export interface RunResult {
  sessionId: string;
  dir: string;
  request: string;
  versionsPerStyle: number;
  iterations: RunIteration[];
  best: { styleId: string; pngPath: string | null; nota: number | null } | null;
  durationMs: number | null;
  estimatedCostUsd: number;
}

// ── Resultado da série (handleSerieRun) ──────────────────────────────────────
export interface SeriePanelResult {
  n: number;
  cena: string;
  pngPath: string | null;
  consistencia: number | null;
  cenaNota: number | null;
  aprovado: boolean;
}
export interface SerieResult {
  serieId: string;
  dir: string;
  canon: { personagens: Array<{ nome: string; anchorPng: string | null }> };
  paineis: SeriePanelResult[];
  contactSheet: string | null;
}

// ── Sessão completa (GET /api/sessions/:id) ──────────────────────────────────
export interface SessionResultEntry {
  job: { id: string; styleId: string; index: number; prompt: string };
  pngPath?: string;
  ok: boolean;
  verdict?: VerdictJson;
}
export interface SessionFull {
  id: string;
  createdAt: string;
  request: string;
  styleIds: string[];
  versionsPerStyle: number;
  iteration: number;
  provider: string;
  genProvider?: string;
  size?: string;
  avoid?: string;
  favorites?: string[];
  totalDurationMs?: number;
  estimatedCostUsd?: number;
  results?: SessionResultEntry[];
  chosen?: { pngPath: string };
}
export interface FullSessionImage {
  iteration: number;
  pngPath: string;
  styleId: string;
  nota: number | null;
  jobId: string;
}
export interface FullSession {
  session: SessionFull;
  log: string[];
  images: FullSessionImage[];
}

// ── Payloads WS ──────────────────────────────────────────────────────────────
export interface RunPayload {
  prompt: string;
  styles: string[];
  versions: number;
  genProvider?: 'codex';
  judgeMode?: 'painel' | 'unico';
  quality?: string;
  size?: string;
  avoid?: string;
  iterate?: number;
}
export interface SerieSpec {
  titulo: string;
  estilo?: string;
  desc?: string;
  canon?: {
    estiloDescricao?: string;
    personagens?: Array<{ nome: string; descricao: string }>;
    paleta?: string;
    mundo?: string;
  };
  paineis: Array<{ cena: string; personagens?: string[] }>;
}
export type RunMessage =
  | { type: 'run'; payload: RunPayload }
  | { type: 'serie-run'; payload: { spec: SerieSpec; size?: string; quality?: string } };
