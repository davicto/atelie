# Ateliê

Esteira interativa (TUI) de geração de imagens de qualidade com **GPT Image 2**, orquestrada pela
**Codex CLI** (auth do ChatGPT, sem `OPENAI_API_KEY`), com um **juiz Claude multimodal** que vê cada
imagem e um **loop de melhoria** guiado por você.

Consolida as técnicas dos 4 projetos em `../` (garden-skills, GPT-Image2-Skill, gpt-image-2-skill,
awesome-gpt-image) numa galeria de **29 estilos fixos** com templates de prompt prontos.

## Fluxo
1. Você digita o pedido em linguagem natural.
2. Escolhe um ou mais **estilos** da galeria (multi-seleção).
3. Escolhe **N** versões (distribuídas entre os estilos escolhidos em round-robin).
4. As imagens são geradas via Codex (`gpt-image-2`), com progresso ao vivo.
5. O **juiz Claude** vê cada PNG e devolve um veredito: nota, alinhamento, problemas, uma
   `sugestão de melhoria` e um `prompt reescrito`.
6. Você decide se quer melhorar. Se sim, o prompt é recomposto (mantendo o sujeito-âncora) e a
   imagem passa de novo pelo caminho de geração + validação. Loop.

## Requisitos
- `node >= 20`, deps já instaladas (`npm install` se faltar `node_modules`).
- Codex CLI logado (auth ChatGPT em `~/.codex/auth.json`). Teste: `npm start -- --doctor`.
- `claude` CLI na PATH (o juiz usa `claude -p --input-format stream-json`).
- O wrapper `gpt-image-2-skill` é **opcional**: sem ele, a geração cai no backend
  da CLI `codex` (ver abaixo).

### Backend de geração
Há dois caminhos, escolhidos automaticamente:

| Backend | Quando | Como gera |
|---|---|---|
| `wrapper` | `WRAPPER_CJS` existe (ver `src/config.ts`) | `node gpt_image_2_skill.cjs … images generate` |
| `cli` | wrapper ausente (default hoje) | `codex exec` + ferramenta embutida `image_gen` |

`ATELIE_GEN_BACKEND=cli|wrapper` força um dos dois. O backend `cli` usa a auth do
ChatGPT e **não consome `OPENAI_API_KEY`** (o fallback `scripts/image_gen.py` da
skill `imagegen`, esse sim, cobraria API — nunca é acionado). Detalhes em
`src/lib/codexCli.ts`.

## Instalar (usuário final)

Baixe o instalador da [página de releases](https://github.com/davicto/atelie/releases)
— `Atelie-Setup-<versão>.exe` no Windows — e execute. **Não é preciso instalar Node,
Codex CLI nem nada antes**: o app já vem com o motor de geração e o componente de login.

Na primeira abertura, o Ateliê pede para conectar a conta **ChatGPT**: ele mostra um
código curto e um link; você confirma no navegador e pronto. É a única credencial
obrigatória — é ela que habilita tanto gerar quanto avaliar as imagens.

> O Windows pode exibir um aviso do SmartScreen ("aplicativo não reconhecido"), porque o
> instalador não tem assinatura digital paga. Clique em **Mais informações → Executar assim
> mesmo**.

O **Claude Code** é opcional e só entra em dois recursos: criar estilos novos e o cânone de
série. Sem ele o app gera, avalia e melhora imagens normalmente.

## Requisitos (desenvolvimento)
- `node >= 20`, deps instaladas (`npm install`).
- Login ChatGPT ativo (`~/.codex/auth.json`). Teste: `npm start -- --doctor`.
- O wrapper `gpt-image-2-skill` e o Codex CLI vêm como dependências npm — nada de
  instalação manual.
- `claude` CLI na PATH apenas para o juiz Claude e o `--add-style`.

## Uso
```bash
npm start                 # abre a TUI (precisa de um terminal real — usa raw mode)
npm run web               # compila a UI e sobe o app no navegador (http://127.0.0.1:4177)
```

## Abrir no navegador
```bash
cd C:\.repo\atelie
npm run web
```
O comando compila a UI e imprime a linha `Ateliê · servidor local em http://127.0.0.1:4177`.
Abra **http://127.0.0.1:4177** no navegador (Ctrl+clique no link do terminal também funciona).
O servidor fica em primeiro plano — `Ctrl+C` encerra.

- Para escolher outra porta: `npm run ui:build && npx tsx src/server/serve.ts --port 5000`.
- Sem `--port`, o servidor sobe numa porta efêmera e a imprime na mesma linha.
- O bind é `127.0.0.1`: só a sua máquina alcança, não a rede.
- Já mexeu no código da UI? Rode `npm run ui:build` de novo (ou `npm run web`) antes de recarregar.

### O que tem na UI web
| Tela | Para quê |
|---|---|
| **Menu** | hub inicial; o logo do pincel, no topo, volta para cá de qualquer tela |
| **Estilos** | portfólio: todos os estilos, detalhe com descrição + imagens de referência, seleção (que a tela Criar herda) e criação de estilos novos a partir de imagens + texto explicativo |
| **Projetos** | um projeto por série: estilo, elenco de personagens (referências → **sprite** → validação) e briefings; gera a série reaproveitando os sprites validados |
| **Criar** | imagem avulsa: pedido + estilos + N versões, com juiz |
| **Série** | série livre, sem projeto, a partir de uma descrição |
| **Sessões / Ambiente / Ajustes** | histórico, diagnóstico das CLIs e configurações |

Os arquivos enviados pelo navegador ficam em `~/.atelie/styles/<estilo>/` (referências de
estilo) e `~/.atelie/projects/<projeto>/cast/<personagem>/` (referências + `sprite.png`).

### Subcomandos de debug (não-interativos)
```bash
npm start -- --doctor
npm start -- --gen-one --style fotorrealista --prompt "um gato de óculos lendo jornal" [--quality low|medium|high]
npm start -- --judge-file <png> --request "um gato de óculos lendo jornal" [--style fotorrealista] [--model sonnet]
```

## Configuração (env)
| Var | Default | Efeito |
|---|---|---|
| `ATELIE_HOME` | `~/.atelie` | raiz de sessões/saídas |
| `ATELIE_JUDGE_MODEL` | `sonnet` | modelo do juiz (visão) |
| `ATELIE_CONCURRENCY` | `0` | jobs de geração em paralelo (`0` = todos de uma vez) |
| `ATELIE_AUTO_OPEN` | `1` | abre a pasta publicada ao fim de cada geração (`0` desliga; na CLI, `--no-open`) |

## Projetos, elenco e sprites
Um **projeto** (`~/.atelie/projects/<id>/project.json`) guarda:
- o **estilo** de ilustração escolhido no portfólio;
- o **elenco**: cada personagem tem as imagens de referência que você subiu e um **sprite**
  (folha de personagem com poses e expressões). Com referências, o sprite sai por
  `images edit` multi-referência; sem elas, por `images generate` a partir da descrição;
- os **briefings**: uma linha por imagem da série;
- os ids das séries geradas ali dentro.

O sprite nasce sempre **reprovado**: regerar zera a validação. Só personagem validado vira
âncora da série — e, nesse caso, a série **não regera** a âncora (economiza uma imagem e
mantém exatamente o que você aprovou). Âncora é caminho de arquivo e nunca é aceita do
cliente: o servidor resolve o sprite a partir do elenco aprovado do projeto.

## Saídas
Cada sessão vive em `~/.atelie/sessions/<id>/`:
- `manifest.jsonl` — log append-only (`session_start`/`generate`/`verdict`/`iterate`/`session_end`)
- `session.json` — snapshot para `--resume <id>`
- `iter-NN/<estilo>-<i>.png` — as imagens

## Estilos
29 estilos em `src/styles/catalog.ts` (procedência em `src/styles/PROVENANCE.md`). Cada um tem um
`template` com `{subject}/{scene}/{extra}` e defaults (tamanho/qualidade/aspecto/fundo). Propriedades
de saída (tamanho/fundo/formato) vão sempre em **flags**, nunca no texto do prompt.

## App Desktop

O mesmo motor roda como app desktop (Electron), com a UI web servida em
`127.0.0.1` numa porta efêmera. O processo main do Electron sobe o servidor Fastify
in-process — sem `OPENAI_API_KEY`, a geração continua via CLIs do usuário.

### Rodar em dev
```bash
npm run desktop:dev   # ui:build → desktop:build (esbuild) → electron .
```
Isso compila a UI (`ui/dist`), bundla `src/desktop/*` + servidor + motor para
`dist-electron/main.cjs` e `preload.cjs`, e abre a janela.

Para iterar só no bundle:
```bash
npm run ui:build       # compila a UI
npm run desktop:build  # (re)gera dist-electron/*.cjs
```

### Empacotar (instaladores)
```bash
npm run dist   # ui:build → desktop:build → electron-builder
```
Gera em `release/`: **Windows** NSIS (`.exe`), **macOS** DMG, **Linux** AppImage
(conforme o SO do build). Config em `electron-builder.yml`.

Releases multiplataforma saem via CI: `git tag vX.Y.Z && git push --tags` dispara
`.github/workflows/release.yml`, que builda em Win/Mac/Linux e publica no GitHub
Releases (feed do `electron-updater`). Em produção o app checa update no start
(`checkForUpdatesAndNotify`, no-op enquanto não há release publicada).

### O que vai dentro do pacote
`extraResources` (em `electron-builder.yml`) embute dois binários nativos, por plataforma:

| Recurso | Caminho no pacote | Para quê |
|---|---|---|
| wrapper `gpt-image-2-skill` | `resources/wrapper/node_modules/…` | gerar e julgar imagens |
| `codex` | `resources/codex/bin/codex[.exe]` | **só** o login ChatGPT do wizard |

Ambos vêm de dependências npm com binário por SO/arch, então o CI monta o pacote certo
em cada runner. `src/config.ts` e `src/lib/codexCli.ts` procuram primeiro esses caminhos
sob `process.resourcesPath` e caem para o `node_modules` local em dev. Do Codex CLI
excluímos o `codex-code-mode-host` (~46 MB), que o Ateliê nunca chama.

O `claude` continua sendo BYO: carrega o login do usuário e não faz sentido embutir. Se
não estiver instalado, o servidor o desliga sozinho no boot (`desligarClisAusentes`), e o
painel de juízes roda só com o Codex.

Em produção não há `node` garantido na PATH: o main seta `ATELIE_NODE_BIN` para o
próprio binário do Electron (`process.execPath`) e o motor spawna o wrapper com
`ELECTRON_RUN_AS_NODE=1` (ver `src/lib/nodeBin.ts`). Em dev, sem essa env, usa `node`.

## Notas técnicas (contrato verificado)
Ver `BUILD_CONTRACT.md`. Pontos que importam:
- `--provider codex` é flag **global** (antes do subcomando `images generate`).
- Sob Codex, `--size` é uma **dica** (não honrado exato) e `--n` não existe → N versões = N chamadas.
- Transparência (sticker/logo) usa o subcomando `transparent generate`.
- O juiz costuma duplicar o texto de saída; o parser (`lib/jsonx.ts`) extrai o primeiro `{...}` balanceado.
