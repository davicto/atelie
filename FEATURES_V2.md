# Ateliê v2 — especificação de features (fonte de verdade para o build v2)

Estende o app existente (NÃO reescrever do zero; refatorar/estender). Obedecer também `BUILD_CONTRACT.md`
(contrato verificado do backend/juiz) e as regras de UI do usuário: **seleção destacada por cor/fundo/negrito,
NUNCA por barra/borda lateral colorida**; sem emojis salvo setas e ✓/✗; pt-BR com acentos.

Paleta (já em `src/theme.ts`): primary #002060, accent #00F0FF, primaryLight #5B7FB9.

## Visão geral das entregas
1. **Modo headless (CLI) completo** para a esteira rodar sem TUI — para automação/uso por um agente.
2. **Menu inicial**: Criar · Sessões · Adicionar estilo · Configurações.
3. **Configurações** persistentes editáveis pela TUI.
4. **Sessões**: listar sessões passadas, ver detalhes/imagens, **continuar** a partir de uma sessão.
5. **Adicionar estilo**: usuário descreve (texto e/ou caminhos de imagens/arquivos); o Claude analisa e
   **sugere um StyleDef** no mesmo formato dos estilos existentes; salva em estilos do usuário (persistente).
6. **Versões por estilo**: ao criar, escolher quantas versões de CADA estilo selecionado (não mais "N total").
7. **[Visualizar]** por imagem: abre o PNG no viewer com um atalho óbvio.
8. **Layout melhor** dos textos/componentes.
9. **Log detalhado ao vivo + cronômetro** (tempo decorrido), salvo na sessão.
10. **Continuar sessão antiga**.
11. **Reavaliar**: pedir ao Claude para refazer a análise de melhoria.
12. **Ver prompt completo** (sem corte "…").

---

## Refatoração central (fazer ANTES das telas)

### `src/lib/settings.ts` — configurações persistentes
Arquivo `~/.atelie/config.json` (sob `ATELIE_HOME`). 
```ts
export interface Settings {
  judgeModel: string;          // default env ATELIE_JUDGE_MODEL || 'sonnet'
  approveThreshold: number;    // default 7
  concurrency: number;         // default env ATELIE_CONCURRENCY || 2
  defaultVersionsPerStyle: number; // default 2
  defaultQuality: 'low'|'medium'|'high'; // default 'high'
  viewerCmd: string | null;    // default null → auto (xdg-open)
}
export function loadSettings(): Settings   // lê config.json; faz merge com defaults; tolera arquivo ausente/corrompido
export function saveSettings(s: Settings): void
export const SETTINGS_FIELDS: Array<{key: keyof Settings; label: string; kind:'string'|'number'|'enum'; options?: string[]}>  // p/ a tela de Configs iterar
```
`src/config.ts` mantém só caminhos estáticos (WRAPPER_CJS, SESSIONS_ROOT, CONFIG_FILE, STYLES_FILE). Todo valor ajustável vem de `loadSettings()`. Os módulos que hoje importam JUDGE_MODEL/CONCURRENCY/APPROVE_THRESHOLD/DEFAULT_N de config.ts passam a ler de settings (ou receber por parâmetro).

### `src/lib/userStyles.ts` — estilos do usuário
Arquivo `~/.atelie/styles.json` = `StyleDef[]` (mesmo tipo de `styles/catalog.types.ts`, + campo opcional `origem?: 'builtin'|'user'`).
```ts
export function loadUserStyles(): StyleDef[]         // [] se ausente
export function saveUserStyle(s: StyleDef): void     // upsert por id; valida id kebab-case único
export function deleteUserStyle(id: string): void
export function getAllStyles(): StyleDef[]           // CATALOG (origem builtin) ++ user styles (origem user)
export function findStyle(id: string): StyleDef | undefined
```
TODO o código que hoje faz `CATALOG.find(...)` passa a usar `getAllStyles()`/`findStyle()`.

### `src/lib/styleGenerator.ts` — Claude cria um StyleDef
```ts
export async function generateStyleDef(input: { descricao: string; imagens?: string[]; arquivos?: string[]; model?: string }): Promise<{ style: StyleDef; raw: string }>
```
Usa o transporte multimodal do juiz (ver `src/lib/judge.ts` / BUILD_CONTRACT): `claude -p --input-format stream-json --output-format stream-json --verbose --model <model||judgeModel>`. Monta 1 turno user cujo `content` = [bloco text com a RUBRICA abaixo] + [1 bloco `image` base64 por caminho em `imagens` que exista e seja PNG/JPG] + (para `arquivos` de texto, ler e incluir trechos no bloco text). RUBRICA: mostra 2-3 exemplos REAIS de StyleDef do catálogo (id/nome/desc/grupo/template com {subject}{scene}{extra}/defaults) e pede para PROPOR um novo StyleDef coerente com a descrição/imagens do usuário, retornando APENAS JSON no schema StyleDef (template deve conter MODO/ESTILO/COMPOSIÇÃO/LUZ/CÂMERA/RESTRIÇÕES fixos e os placeholders; NÃO colocar tamanho/fundo no texto). Parsear com `extractJson` (lib/jsonx). Validar/coagir campos (id kebab-case slug do nome se ausente; defaults válidos). Retorna style + raw (texto do Claude) para exibição.

### `src/lib/logger.ts` — log + cronômetro
```ts
export interface LogEntry { ts: string; elapsedMs: number; level: 'info'|'ok'|'warn'|'err'; msg: string }
export class SessionLogger {
  constructor(sessionId: string, startedAt: number)
  log(msg: string, level?: LogEntry['level']): LogEntry   // calcula elapsed desde startedAt; anexa a events.log da sessão; guarda em ring buffer
  entries(): LogEntry[]
  elapsedMs(): number
}
```
Grava linhas legíveis em `~/.atelie/sessions/<id>/events.log` (ex.: `12:30:05 [+0.0s] info  gerando fotorrealista #0…`). A TUI lê `entries()` para o LogPanel; o cronômetro usa `elapsedMs()`.

### `src/lib/pipeline.ts` — esteira COMPARTILHADA (TUI e headless usam a MESMA)
Extrair a lógica de geração+julgamento de App.tsx para cá, com callbacks.
```ts
export interface RunOptions { request:string; styleIds:string[]; versionsPerStyle:number; quality?:string; concurrency?:number; judgeModel?:string; approveThreshold?:number; onProgress?:(e:ProgressEvent)=>void; onLog?:(e:LogEntry)=>void; signal?:AbortSignal }
export interface IterationResult { iteration:number; results:JobResult[]; best?:JobResult; durationMs:number }
// Cria/abre a sessão, monta jobs = buildJobs(styleIds, versionsPerStyle), compõe prompts, gera com pool (concurrency), julga cada PNG ok, calcula best (maior nota), grava manifest (generate/verdict) + durações, loga cada passo via onLog. Retorna a iteração.
export async function runIteration(session:Session, opts:RunOptions, logger:SessionLogger): Promise<IterationResult>
// Loop automático (headless): roda 1ª iteração; enquanto !aprovado e rounds restantes, recompõe usando best.verdict.prompt_sugerido/sugestao_melhoria (promptComposer.compose com judgeCtx, mantendo subjectAnchor) e roda de novo.
export async function runAuto(opts:RunOptions & { maxIterations:number }): Promise<{ session:Session; iterations:IterationResult[]; best?:JobResult }>
// Reavaliação: re-julga uma imagem existente (ou todas de uma iteração) gerando novo verdict.
export async function reJudge(pngPath:string, request:string, style:{nome:string;desc:string}, judgeModel:string): Promise<Verdict>
```
`src/lib/distribute.ts`: adicionar `export function buildJobs(styleIds:string[], versionsPerStyle:number, outDir:string): GenJob[]` — para cada styleId, `versionsPerStyle` jobs; `index` global crescente; id `${styleId}-${index}`; mode 'transparent' se style.defaults.background==='transparent'; outPath em outDir. (Manter `roundRobin` se ainda referenciado, mas o fluxo novo usa buildJobs.)

### `src/lib/sessions.ts` — navegar sessões
```ts
export interface SessionSummary { id:string; createdAt:string; request:string; styleIds:string[]; iterations:number; imageCount:number; bestNota:number|null; durationMs?:number }
export function listSessions(): SessionSummary[]   // varre ~/.atelie/sessions/*/session.json (ou manifest), ordena desc por createdAt
export function loadFullSession(id:string): { session:Session; log:string[]; images:{iteration:number; pngPath:string; styleId:string; nota:number|null}[] } | null
```
"Continuar": carregar a Session e rodar `runIteration` com iteration = session.iteration+1 (nova iteração anexada à mesma pasta/manifest), permitindo mudar prompt/estilos ou reaplicar melhoria.

### `src/state/manifest.ts` (estender)
- registros novos: `{type:'log', iteration, elapsedMs, level, msg}` (opcional — events.log já cobre) e durações em `generate`/`iterate`/`session_end` (`durationMs`). 
- `session.json` passa a guardar: `versionsPerStyle`, `totalDurationMs`, `iterationsMeta:[{iteration,durationMs}]`.

### `src/types.ts` (estender)
Adicionar `Settings` (ou importar de settings), `SessionSummary`, `LogEntry`; adicionar em `Session`: `versionsPerStyle:number`, `totalDurationMs?:number`. Screen união ganha: `'menu'|'config'|'add_style'|'sessions'|'session_detail'|'prompt_view'`.

---

## CLI headless (`src/cli.tsx`) — SUBCOMANDOS NOVOS (críticos; eu os testo)
Manter os debug atuais (--doctor/--gen-one/--judge-file/--resume). Adicionar (usando `pipeline.ts`):

- `--run --prompt "<txt>" --styles a,b,c --versions <N> [--quality low|medium|high] [--iterate <M>] [--json]`
  Roda a esteira: N versões de cada estilo, julga, escolhe best; se `--iterate M`, auto-melhora até aprovar ou M rondas extras. Sem `--json`: imprime resumo legível (por imagem: estilo, nota, ✓/✗, caminho; best; tempo). Com `--json`: imprime o objeto:
  ```json
  {"sessionId":"...","dir":"...","request":"...","versionsPerStyle":N,
   "iterations":[{"iteration":1,"durationMs":123,"results":[{"styleId":"...","index":0,"pngPath":"...","ok":true,"verdict":{"nota":8,"aprovado":true,"alinhamento":"...","problemas":[...],"sugestao_melhoria":"...","prompt_sugerido":"..."}}],"best":{"styleId":"...","index":0,"pngPath":"...","nota":8}}],
   "best":{"styleId":"...","pngPath":"...","nota":8},"durationMs":456}
  ```
  Loga progresso no stderr (linhas do logger) para ser observável.
- `--sessions [--json]` → lista sessões (id, data, pedido, nº imagens, melhor nota). 
- `--session <id> [--json]` → detalhe de uma sessão (imagens + vereditos + caminho da pasta).
- `--continue <id> [--iterate <M>] [--prompt "<novo>"] [--json]` → continua uma sessão (nova iteração).
- `--add-style --desc "<txt>" [--images a.png,b.png] [--files x.md] [--save] [--json]` → gera StyleDef via Claude; sem `--save` só imprime a sugestão; com `--save` grava em styles.json.
- `--list-styles [--json]` → lista todos os estilos (builtin + user) com id/nome/grupo/origem.

Roteamento: se qualquer subcomando headless presente → executa e sai (nunca abre TUI). Só abre TUI sem flags.

---

## TUI (`src/App.tsx` + componentes)

Fluxo de telas (Screen). Entrada: `bootstrap` → `menu`.

### `menu` — componente `MainMenu.tsx`
Lista vertical navegável (↑↓, Enter): **Criar** · **Sessões** · **Adicionar estilo** · **Configurações** · **Sair**. Banner no topo. Item ativo destacado por cor/negrito/fundo (sem borda lateral). Rodapé com atalhos.

### Criar (fluxo)
`prompt_input` (PromptBox, ver prompt completo enquanto digita) → `style_select` (StyleGallery multi, sobre `getAllStyles()`, agrupado por grupo, mostra origem user com marcador) → `versions_select` (NSelector "versões de CADA estilo", 1..8; mostra total = estilos×versões) → `generating` → `judging` → `review` → `improve_question`/loop → `done`.
- `generating`+`judging`: tela dividida — **LogPanel** (log detalhado ao vivo, últimas ~10 linhas do logger) + **Timer** (cronômetro mm:ss atualizando 1×/s via useEffect+setInterval) + **ProgressPanel** (barra por job). 
- `review` — `VerdictGrid` reformulado: cada linha = estilo · versão# · nota · ✓/✗ · trecho do problema · **[Visualizar]**. Navegação ↑↓ seleciona linha. Atalhos (mostrados no StatusBar):
  - `o` ou `v` = **Visualizar** a imagem selecionada (openViewer no pngPath).
  - `p` = **ver prompt completo** da linha selecionada → tela `prompt_view` (PromptView mostra o prompt composto INTEIRO, sem corte, + o prompt_sugerido do juiz; scroll se longo; Esc volta).
  - `r` = **reavaliar** (re-judge) a imagem selecionada via `pipeline.reJudge` → atualiza o veredito e loga.
  - `Enter` = **melhorar** (vai a improve_question usando o best OU a linha selecionada).
  - `q` = voltar ao menu.
- `improve_question` — ImprovePrompt: mostra alinhamento+sugestao_melhoria+prompt_sugerido COMPLETOS (sem corte); escolhe melhorar s/n e modo g(regenerar)/e(editar âncora). Sim → recompoe e volta a generating (iteration++).
- `done` — resumo final + tempo total; grava session_end com totalDurationMs.

### `sessions` — `SessionsScreen.tsx`
Lista `listSessions()` (↑↓, Enter abre `session_detail`). Mostra data, pedido (curto), nº imagens, melhor nota, duração.
### `session_detail` — `SessionDetail.tsx`
Mostra imagens da sessão (estilo/versão/nota/caminho) com [Visualizar] (o), ver prompt completo (p), ver log da sessão (l → lê events.log). Ações: **Continuar** (c → carrega a Session e entra no fluxo Criar a partir dela, nova iteração) e **Reavaliar** (r → re-judge de uma imagem).

### `add_style` — `AddStyleScreen.tsx`
Campos: descrição (TextInput multilinha simples), caminhos de imagens (TextInput, vírgula-separado, opcional), caminhos de arquivos (opcional). Ao confirmar → chama `generateStyleDef` (spinner + log "Claude analisando…"). Mostra o StyleDef sugerido (nome/grupo/template completo/defaults) em `StyleSuggestion`. Usuário pode **editar o id/nome** e **Salvar** (saveUserStyle) ou **Regenerar** (pede de novo) ou cancelar. Salvo, o estilo aparece em Criar.

### `config` — `ConfigScreen.tsx`
Itera `SETTINGS_FIELDS`; ↑↓ escolhe campo, Enter/setas editam (número: ± e dígitos; enum: cicla opções; string: TextInput). Salva via `saveSettings` ao confirmar. Mostra valor atual de cada.

### Componentes novos/alterados
`MainMenu.tsx`, `ConfigScreen.tsx`, `AddStyleScreen.tsx`, `StyleSuggestion.tsx`, `SessionsScreen.tsx`, `SessionDetail.tsx`, `LogPanel.tsx`, `Timer.tsx`, `PromptView.tsx`, `VersionsSelector.tsx` (ou reusar NSelector), `VerdictGrid.tsx` (reformular c/ seleção de linha + [Visualizar] + sem corte de texto nos detalhes), `PromptBox.tsx` (permitir ver completo).

### Layout (melhorar disposição)
- Estrutura em Box column: Banner (compacto) / área principal (a tela) / StatusBar (atalhos contextuais). Usar larguras/`flexDirection`/`gap` (marginY) para espaçar. Textos longos com `<Text wrap="wrap">` em vez de cortar; onde precisar resumir na grade, cortar SÓ na visão de grade, com `p` para ver completo.
- Selecionado = cor accent + negrito (e/ou fundo), NUNCA borda/barra lateral colorida.

---

## Gates
- `npx tsc --noEmit` limpo.
- Headless: `--doctor` ok; `--list-styles --json` lista; `--run --prompt "teste" --styles fotorrealista --versions 1 --quality low --json` gera+julga e imprime JSON com pngPath e verdict; `--sessions --json` mostra a sessão criada; `--add-style --desc "aquarela noturna com neon" --json` imprime um StyleDef.
- TUI: `--doctor` sem stack; App importa em runtime.
