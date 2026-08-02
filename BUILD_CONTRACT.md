# BUILD_CONTRACT — fatos VERIFICADOS em runtime (fonte de verdade para o build)

Este arquivo tem prioridade sobre o plano em qualquer divergência. Tudo abaixo foi testado com sucesso
em foreground neste ambiente (node v22.18, npm 11.14, `claude` v2.1.204).

## Ambiente
- `node`, `npm`, `npx` disponíveis. `tsx` entra como devDependency (rodar via `npx tsx`).
- `claude` na PATH, v2.1.204, aceita `-p --input-format stream-json --output-format stream-json --verbose --model <m>`.
- Wrapper de geração — `src/config.ts` resolve o primeiro caminho que existir:
  1. `$ATELIE_WRAPPER_CJS` (override manual);
  2. `Active/images-editor/gpt-image-2-skill/skills/gpt-image-2-skill/scripts/gpt_image_2_skill.cjs`
     (o repo clonado original; **apagado na reorganização de 26/07/2026**, volta a valer se re-clonado);
  3. `~/.local/lib/atelie/gpt_image_2_skill.cjs` — shim que repassa argv ao binário Rust
     `~/.local/lib/atelie/gpt-image-2-skill` (v0.7.3, preservado do cache de download). Em uso hoje.

  Executar com `node <WRAPPER_CJS> ...`. O binário Rust já faz bootstrap sozinho (baixou e rodou). Auth Codex = ChatGPT (plan Plus); token expirado é auto-refreshado pelo próprio wrapper (visto no evento `auth.refresh.completed`). SEM `OPENAI_API_KEY`.

## Backend `cli` — geração via `codex exec` (VERIFICADO 28/07/2026, codex-cli 0.145.0, Windows)
Usado quando o `WRAPPER_CJS` não existe (default hoje). Implementação: `src/lib/codexCli.ts`.
```
codex exec --json --skip-git-repo-check -s read-only [-i <ref.png> …] -
# instrução vai por STDIN
```
REGRAS TRAVADAS (aprendidas na verificação):
1. **A instrução vai por STDIN (`-`), NUNCA como argumento.** No Windows as CLIs são shims `.cmd` e o
   `cmd.exe` **TRUNCA o argumento na primeira quebra de linha** — comprovado: `['linha1\nlinha2']` chega
   como `["linha1"]`. Com a instrução em argv o prompt chegava mutilado e o modelo inventava a cena
   (pedi "gato de óculos lendo jornal" e veio um átrio de biblioteca). Por stdin não há escape de shell.
2. `codex exec` **TRAVA** se o stdin ficar aberto sem dados (`Reading additional input from stdin...`).
   `run()` usa `stdio:'ignore'` quando não há `stdinData`, então só passa a esperar quando de fato escrevemos.
3. O tool embutido `image_gen` **não aceita caminho de destino**: salva sempre em
   `<CODEX_HOME>/generated_images/<thread_id>/<call_id>.png`. O `thread_id` (do evento
   `thread.started`) é a ÂNCORA para achar o arquivo — a prosa da mensagem final também cita o caminho,
   mas é texto de LLM e não é confiável. Copiamos por cima de `job.outPath`.
4. Eventos JSONL em **stdout** (um por linha): `thread.started` (traz `thread_id`) → `turn.started` →
   `item.started`/`item.completed` (`item.type`: `agent_message` | `command_execution`) → `turn.completed`.
5. O agente costuma emitir uma `agent_message` ANTES de trabalhar → o progresso precisa ser **monotônico**
   (senão a barra salta 85% → 25% → 85%).
6. Transparência: `gpt-image-2` **não** tem fundo transparente nativo. O caminho suportado é chroma-key
   verde + recorte local com `<CODEX_HOME>/skills/.system/imagegen/scripts/remove_chroma_key.py` (Python).
7. Auth: `codex login status` **MENTE** — ele só lê o `auth.json` local e responde "Logged in" mesmo com o
   token invalidado no servidor (visto em 28/07/2026: `token_invalidated` + `refresh_token_invalidated`).
   O erro real só aparece na primeira geração, como 401 → mapeado para `auth_missing`.

## Geração — comando EXATO (verificado, exit 0, PNG gerado)
```
node <WRAPPER_CJS> --json --json-events --provider codex images generate \
  --prompt "<texto>" --out "<ABS>.png" --size 2K --quality <low|medium|high> --format png
```
REGRAS TRAVADAS (aprendidas na verificação):
1. **`--provider codex` é flag GLOBAL** → vem ANTES do subcomando `images generate`. Colocá-lo depois dá
   `{"ok":false,"error":{"code":"invalid_command","message":"unexpected argument '--provider'"}}`. (Idem `--json`, `--json-events`.)
2. Ordem: `node <cjs> [FLAGS GLOBAIS] <subcomando> [flags do subcomando]`.
3. **`--out` é a fonte de verdade do caminho** (nós o controlamos; confirmar com `existsSync`). O envelope stdout
   pode trazer `data.output === null`; o caminho final também aparece no evento `output_saved` (`data.output.path` / `data.output.files[].path`).
4. Sob Codex: `supports_n:false`. NÃO passar `--n/--mask/--moderation/--input-fidelity` (→ `unsupported_option`).
5. Sob Codex o **`--size` é uma DICA, não honrado exato** (pedi 1024x1024 e voltou 1402x1122). Passe mesmo assim
   (default `2K`); a proporção sai aproximada. `--background` é ignorado no Codex → transparência só via subcomando `transparent generate`.
6. `edit`: `node <cjs> --json --json-events --provider codex images edit --prompt "<instr>" --ref-image "<ABS prev>.png" --out "<ABS next>.png" --size 2K --quality high --format png`.
7. `transparent generate`: `node <cjs> --json --json-events --provider codex transparent generate --prompt "..." --out "<ABS>.png" --size 2K --quality high`.
8. doctor: `node <cjs> --json doctor`; auth inspect: `node <cjs> --json auth inspect`.

### Envelope stdout (`--json`)
Sucesso: `{ "ok": true, "provider_selection": {...,"resolved":"codex","supports_n":false}, "request": {...}, "retry": {...}, "data": {...} }`.
Erro: `{ "ok": false, "error": { "code": "...", "message": "..." } }`. Códigos vistos/possíveis:
`invalid_command, invalid_argument, unsupported_option, runtime_unavailable, auth_missing, auth_parse_failed, refresh_failed, network_error, http_error, transparent_verification_failed`.

### Eventos stderr (`--json-events`) — formato REAL observado
Cada linha é um JSON: `{ "data": {...}, "kind": "local|progress|sse", "seq": N, "type": "..." }`.
- FILTRAR `kind === "sse"` (ruído do passthrough Codex) e envolver cada `JSON.parse` em try/catch (linhas parciais).
- Fases úteis em `kind:"progress"` com `data.phase` + `data.percent` + `data.message`:
  `auth_refresh_completed`(4) → `request_started`(0) → `response_created`(15) → `output_item_done`(85) →
  `response_completed`(95) → `request_completed`(97) → `output_saved`(100, com `data.output.path`).
- `type:"retry_scheduled"` → mostrar aviso "retentando".

## Juiz multimodal — VERIFICADO (claude vê o PNG e retorna JSON válido)
```
claude -p --output-format stream-json --input-format stream-json --verbose --model <sonnet|opus>
```
- stdin recebe UMA linha JSON (depois `stdin.end()`), `content` OBRIGATORIAMENTE array de blocos:
```json
{"type":"user","message":{"role":"user","content":[
  {"type":"text","text":"<rubrica + pedido + estilo + 'responda só JSON no schema'>"},
  {"type":"image","source":{"type":"base64","media_type":"image/png","data":"<base64 do PNG>"}}]}}
```
- Ler stdout linha-a-linha; acumular texto de `type:"assistant"` (`message.content[].text`) E de `type:"result"` (`result`).
  ATENÇÃO: o texto costuma vir DUPLICADO (aparece no bloco assistant E no result). Por isso o parser DEVE extrair
  o **primeiro objeto `{...}` balanceado** (função `extractJson`), o que naturalmente descarta a duplicata.
- Rubrica inlinada no turno user (NÃO usar `--append-system-prompt`).
- Model default do juiz: `sonnet` (visão OK, mais barato/rápido que opus). Env `ATELIE_JUDGE_MODEL` override.

### Schema do veredito (o juiz retornou exatamente isto)
```json
{"aprovado":true,"nota":9,"alinhamento":"...","problemas":["..."],
 "sugestao_melhoria":"instrução única acionável","prompt_sugerido":"prompt completo reescrito, pronto p/ regenerar"}
```
Fallback lenient: se `extractJson` falhar → `{aprovado:false,nota:null,alinhamento:"(veredito ilegível)",problemas:["juiz não retornou JSON"],sugestao_melhoria:"",prompt_sugerido:"",raw:<texto>}`.
Coerção: `nota`→número clamp 0–10; se `aprovado` ausente, derivar de `nota >= APPROVE_THRESHOLD` (default 7). Retry 1× acrescentando "Responda APENAS com JSON".

## tsconfig alvo (baseado em gibraltar/monitor)
target ES2022, module ESNext, moduleResolution Bundler, jsx react-jsx, strict true, esModuleInterop true,
skipLibCheck true, noEmit true, resolveJsonModule true, lib ["ES2022"], types ["node"]. **Relaxar** `noUnusedLocals`/`noUnusedParameters` para `false` (reduz atrito no build).
