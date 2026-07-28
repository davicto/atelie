# Ateliê v3 — especificação (fonte de verdade; estende v2)

Estende o app v2 (ver FEATURES_V2.md) sem quebrar o que funciona. Obedecer BUILD_CONTRACT.md e a regra de UI
(seleção por cor/negrito/fundo, NUNCA borda/barra lateral colorida; sem emojis salvo setas e ✓/✗; pt-BR).

Decisões do usuário: incluir TUDO — (1) juiz multi-modelo via agy com **painel de consenso como PADRÃO**,
(2) contact-sheet HTML por sessão, (3) referências + negativos + aspecto no Criar, (4) favoritos/export + custo + batch,
e (5) **agy também como PROVEDOR DE GERAÇÃO de imagem** (além de juiz).

## Fatos VERIFICADOS do `agy` (binário `/home/pedro/.local/bin/agy`, v1.0.10, Go)
- CLI de agente multi-provider. Modo headless: `agy -p "<prompt>" --model "<NOME EXATO>" --dangerously-skip-permissions`.
- `agy models` (nomes EXATOS de `--model`): `Gemini 3.5 Flash (Low|Medium|High)`, `Gemini 3.1 Pro (Low|High)`,
  `Claude Sonnet 4.6 (Thinking)`, `Claude Opus 4.6 (Thinking)`, `GPT-OSS 120B (Medium)`.
- **Vê imagem por CAMINHO** (tem ferramenta de visão): validado — julgou o PNG do gato e retornou JSON. Gemini Flash Low deu nota 10 onde o Claude deu 8 (leniência varia → valor do painel).
- **Gera imagem** (agêntico): `agy -p "gere imagem de X, salve EXATAMENTE em <ABS>"` → salvou no caminho pedido. CAVEAT: sem flags de size/quality; salvou **JPEG** com extensão .png (1024x1024). Precisa detectar o formato real (magic bytes) e ajustar extensão/mime.
- É agêntico e mais lento (~1–2 min) que os caminhos diretos. Não suporta mask/edit determinístico → edit/transparent continuam SÓ no codex.

## Registro de provedores (o núcleo do v3)

### Geração — `src/lib/genProviders.ts`
```ts
export type GenProviderId = 'codex' | 'agy'
export interface GenProvider {
  id: GenProviderId
  label: string
  generate(job: GenJob, opts: GenGenOpts): Promise<{ pngPath: string; meta: GenMeta }>  // grava em job.outPath
  supportsEdit: boolean       // codex true, agy false
  supportsTransparent: boolean// codex true, agy false
}
```
- `codex` = a lógica atual de `src/lib/imageBackend.ts` (renomear internamente como provider, mantendo a função).
- `agy` = novo `src/lib/agyBackend.ts`: monta prompt agêntico ("Gere uma imagem: <prompt composto>. Salve o PNG final EXATAMENTE em <outPath>. Responda só o caminho.") + `--model <modelo de imagem do agy>` (usar o default/um modelo Gemini; expor em settings `agyImageModel`). Após rodar: `existsSync(outPath)`; se ausente, procurar PNG/JPG recém-criado e mover p/ outPath; **detectar formato real** por magic bytes (PNG 89 50 4E 47 / JPEG FF D8) e renomear a extensão de acordo (ou converter só se necessário — mas o juiz e o viewer aceitam ambos). Retornar meta {resolved:'agy', model, format}.
- Seleção: settings `genProvider: 'codex'|'agy'` (default 'codex'). No Criar, opção de gerar com um provedor OU **com ambos** (compara gpt-image-2 vs agy lado a lado — trata como uma dimensão a mais, análoga a estilo). buildJobs ganha o provider por job.

### Juiz — `src/lib/judgeProviders.ts` + painel de consenso
```ts
export interface JudgeSpec { provider: 'claude' | 'agy' | 'codex'; model: string; label: string }
export interface PanelVerdict extends Verdict { painel: Array<{ spec: JudgeSpec; verdict: Verdict }> }
export async function judgePanel(pngPath, request, style, panel: JudgeSpec[]): Promise<PanelVerdict>
```
TRÊS provedores de juiz, TODOS validados ao vivo (08/07/2026):
- `claude` = juiz atual (`claude -p` base64 no stdin). **Corrigir**: detectar media_type por magic bytes (pode ser JPEG do agy) em vez de fixar image/png. (deu nota 8 no teste)
- `agy` = `agy -p "<rubrica apontando o CAMINHO do PNG + pede JSON>" --model "<nome exato>" --dangerously-skip-permissions`; `extractJson` da saída. Modelos: ver reference_agy_cli. (Gemini Flash deu 10)
- `codex` = via o BACKEND do Codex (o `codex exec` está QUEBRADO neste ambiente — falha no startup "line 4 column 30"; NÃO usar). Usar o escape hatch do wrapper: montar body de `responses` `{model:"gpt-5.4",store:false,stream:true,input:[{role:"user",content:[{type:"input_image",image_url:"data:<mime>;base64,<b64>"},{type:"input_text",text:"<rubrica JSON>"}]}]}`, gravar em arquivo temp, rodar `node <WRAPPER_CJS> --json --json-events --provider codex request create --request-operation responses --body-file <temp>`, e **reconstruir o texto dos eventos SSE no stderr**: concatenar `data.delta` dos eventos `type:"response.output_text.delta"` (fallback: `data.text` de `response.output_text.done`), depois `extractJson`. (gpt-5.4 deu 10). Detectar mime por magic bytes. Limpar o temp.
- **Consenso (DEFAULT = painel 3-way cross-provider)**: `[{claude,'sonnet'}, {codex,'gpt-5.4'}, {agy,'Gemini 3.5 Flash (High)'}]` — Anthropic + OpenAI + Google. Consolidar: `nota` = média (arredonda .5); `aprovado` = média ≥ approveThreshold; `problemas` = união deduplicada (cap ~6); `sugestao_melhoria`/`prompt_sugerido` = do juiz de MENOR nota (mais crítico); guardar `painel[]` (veredito por modelo) para exibir. Julgar os 3 em paralelo por imagem.
- Configurável em Configurações: adicionar/remover juízes e escolher modelos; modo "juiz único" para velocidade/custo.
- Trade-off (avisar em Configs e no início da geração): painel = 3 chamadas de juiz por imagem → some tempo/custo rápido em sessões grandes.

### Settings novos (`src/lib/settings.ts`)
`genProvider` ('codex'|'agy'), `agyImageModel` (string), `judgeMode` ('painel'|'unico'), `judgePanel` (JudgeSpec[]), `singleJudge` (JudgeSpec). Editáveis na tela Configurações.

## (2) Contact-sheet HTML por sessão — `src/lib/contactSheet.ts`
`export function buildContactSheet(sessionId): string` → grava `~/.atelie/sessions/<id>/contact-sheet.html` AUTOCONTIDO: cada imagem em `<img src="data:...;base64,...">` (detectar mime), com estilo, versão#, provedor, nota, veredito (alinhamento/problemas/sugestão) e o PROMPT COMPLETO por baixo. Layout em grade responsiva, tema claro/escuro. Botão/atalho **[Abrir galeria]** na review e no detalhe da sessão → gera (se preciso) e `openViewer(htmlPath)` (abre no navegador; no WSL usa o handler do sistema). Regerar a cada iteração.

## (3) Referências + negativos + aspecto no Criar
- **Referências**: no fluxo Criar, campo opcional de caminho(s) de imagem. Se presente, os jobs usam `images edit --ref-image` (codex) para consistência/style-transfer (agy não suporta edit → se genProvider=agy com refs, avisar e cair p/ codex nesses jobs). Guardar refs na sessão.
- **Negativos**: campo "evitar" (TextInput). `promptComposer.compose` acrescenta ` Avoid: <negativos>.` ao final (além do avoid do template).
- **Dimensões (escolher antes de gerar)**: no fluxo Criar, tela `DimensionsSelector` DEPOIS do estilo e antes de gerar — permite escolher:
  (a) presets por aspecto/tamanho: Quadrado 1024²/2048², Retrato 1536×2048, Paisagem 2048×1152, Wide 2048×896, ou "Padrão do estilo";
  (b) **WxH customizado** com validação (ambos múltiplos de 16, aresta ≤3840, ≤8.294.400px, razão ≤3:1) reusando/estendendo `resolveSize`.
  A escolha sobrepõe `style.defaults.size/aspect` e vai para o `--size` do codex e para o texto do prompt do agy.
  HONESTIDADE NA UI (avisar): sob **codex** o `--size` é só DICA (a saída sai com aspecto aproximado, não exato — verificado); sob **agy** não há controle de tamanho (sai ~1024²). Dimensão EXATA só seria possível via API OpenAI (sem key aqui). Mostrar isso como nota discreta na tela. Guardar a dimensão pedida na sessão/manifest.
  Headless: `--size 2K|WxH|square|portrait|landscape|wide` no `--run`/`--batch`.

## (4) Favoritos/export + custo + batch
- **Favoritos**: na review/detalhe, tecla `f` marca/desmarca um resultado como favorito (persistir em session.json `favorites: string[]` de pngPath).
- **Export**: tecla `x` exporta favoritos (ou o selecionado) para `~/Pictures/atelie/<slug-do-pedido>/` copiando o arquivo + um `.txt` com prompt/estilo/veredito ao lado. Slug = kebab do request + timestamp.
- **Custo/tempo**: `src/lib/cost.ts` estima custo por sessão: imagens codex (faixa por quality/size) + imagens agy + tokens de juiz (aprox.). Mostrar no `done`/resumo e salvar em session.json (`estimatedCostUsd`). Tempo já vem do cronômetro/logger (v2).
- **Batch headless**: `--batch <file.jsonl>` onde cada linha = `{request, styles:[...], versionsPerStyle, quality?, genProvider?, iterate?}`. Roda cada pedido via `pipeline.runAuto`, uma sessão por linha; `--json` imprime array de resultados. Concorrência entre pedidos = settings.concurrency (cuidado com rate limit).

## CLI headless (estender §CLI do v2)
- `--gen-provider codex|agy` em `--run`/`--batch`.
- `--judge-mode painel|unico` e `--judge-models "claude:sonnet,agy:Gemini 3.5 Flash (High)"` em `--run`.
- `--refs a.png,b.png`, `--avoid "texto, marca dágua"`, `--aspect square|portrait|landscape` em `--run`.
- `--batch <jsonl> [--json]`.
- `--contact-sheet <sessionId>` gera e imprime o caminho do HTML.

## Gates
- `npx tsc --noEmit` limpo.
- `--run --prompt "..." --styles fotorrealista --versions 1 --gen-provider agy --judge-mode unico --judge-models "agy:Gemini 3.5 Flash (Low)" --quality low --json` → gera via agy, julga via agy, JSON ok.
- `--run ... --gen-provider codex --judge-mode painel --json` → gera via codex, painel de 2 juízes, PanelVerdict com `painel[]`.
- `--contact-sheet <id>` gera HTML que abre no navegador.
