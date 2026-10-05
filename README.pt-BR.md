# Rich Input Editor para Claude Code

[English](README.md) · **Português**

Um [Rich Input Editor no estilo do Warp](https://docs.warp.dev/agents/cli-agents/rich-input/) para o Claude Code, feito como plugin. Ele abre um editor multi-linha num painel dentro do terminal, com autocomplete de `@` para arquivos **e pastas**. Quando você termina, o texto volta para o prompt do Claude Code.

## Por quê

O Claude Code já tem o `Ctrl+G`, que abre o prompt no seu `$EDITOR`. Mas no editor externo você perde o autocomplete de `@` e precisa digitar os caminhos de cabeça. Este plugin mantém você dentro do Claude Code e completa as menções `@` enquanto você digita, pasta por pasta.

## Recursos

- **Editor multi-linha** num painel, com quebra automática de linha, indicador de linha e coluna e suporte a mouse (clique posiciona o cursor, arrastar seleciona).
- **Autocomplete de `@` para arquivos e pastas:**
  - `@` lista a raiz do projeto.
  - Ao aceitar uma pasta, o menu continua aberto com o conteúdo dela (`@src/` → `@src/lib/` → arquivo).
  - Digitar só um nome (`@parse`) busca no projeto inteiro.
  - Usa `git ls-files`, então respeita o `.gitignore`. Fora de um repositório git, percorre as pastas (até 5.000 itens, sem `node_modules`, `dist` etc.).
  - Caminhos com espaço ficam entre aspas (`@"docs/minhas notas.md"`), como o prompt nativo faz.
- **Teclas de edição:** navegação por palavra (`Ctrl/Alt+←/→`), seleção (`Shift+setas`, `Ctrl+A`), desfazer e refazer (`Ctrl+Z`/`Ctrl+Y`), e `Ctrl+W`/`Ctrl+U`/`Ctrl+K`.
- **Você nunca perde o rascunho:** o que estava no prompt vai para o editor quando ele abre. Fechar o editor (`Esc`, botão de fechar, Cancelar) devolve o rascunho ao prompt.
- **Abre de três jeitos:** um atalho de teclado, o comando `/rich` ou o botão **✎ Rich input** acima do prompt.

## Requisitos

- Claude Code **2.1.289 ou mais novo**. O plugin usa a API de *function hooks* do Claude Code (módulos de hooks em TypeScript com painéis de UI). Essa API está em **acesso antecipado** e pode mudar entre versões.
- Um terminal que repasse cliques do mouse para o Claude Code. Você clica no editor para digitar nele (veja [Limitações conhecidas](#limitações-conhecidas)).

## Instalação

### Opção 1: pelo GitHub (recomendado)

```bash
claude plugin marketplace add higorcesarqn/rich-input-editor
claude plugin install rich-input@rich-input-editor
```

Ou, de dentro de uma sessão do Claude Code:

```
/plugin marketplace add higorcesarqn/rich-input-editor
/plugin install rich-input@rich-input-editor
/reload-plugins
```

Para atualizar depois:

```bash
claude plugin marketplace update rich-input-editor
claude plugin update rich-input@rich-input-editor
```

### Opção 2: de um clone local

```bash
git clone https://github.com/higorcesarqn/rich-input-editor.git
claude --plugin-dir ./rich-input-editor/plugins/rich-input
```

O `--plugin-dir` carrega o plugin só naquela sessão. Para carregar sempre, instale a partir do marketplace local:

```bash
claude plugin marketplace add ./rich-input-editor
claude plugin install rich-input@rich-input-editor
```

## Atalho de teclado

Plugins não podem registrar uma tecla própria. Em vez disso, o botão **✎ Rich input** escuta uma *ação* de keybinding do Claude Code, e você liga uma tecla a essa ação. Por padrão a ação é `app:toggleReplTab`.

Para abrir o editor com **Alt+R**, coloque isto no `~/.claude/keybindings.json` (crie o arquivo se ele não existir):

```json
{
  "$schema": "https://www.schemastore.org/claude-code-keybindings.json",
  "$docs": "https://code.claude.com/docs/en/keybindings",
  "bindings": [
    {
      "context": "Global",
      "bindings": {
        "alt+r": "app:toggleReplTab"
      }
    }
  ]
}
```

Se o `app:toggleReplTab` já tiver uso no seu ambiente, escolha outra ação sem uso e coloque-a na opção `shortcutAction` do plugin (`/plugin configure rich-input@rich-input-editor`, ou `/config`). O atalho só funciona enquanto a linha do botão acima do prompt estiver visível (opção `showBand`, ligada por padrão).

## Uso

1. Abra o editor: **Alt+R**, `/rich` ou o botão **✎ Rich input**. `/rich algum texto` abre o editor já com esse texto.
2. **Clique na área de texto** para ela receber o teclado.
3. Escreva. Digite `@` para mencionar arquivos e pastas.
4. Aperte **Ctrl+S** (ou o botão **Enviar ao prompt**). O editor fecha e o texto vai para o prompt do Claude Code.
5. Aperte **Enter** para enviar.

### Teclas

| Tecla | Ação |
| --- | --- |
| `Enter` / `Ctrl+J` | Nova linha |
| `Ctrl+S` / `Ctrl+Enter` | Manda o texto para o prompt |
| `@` | Abre o autocomplete de arquivos e pastas |
| `↑` `↓` | Escolhe a sugestão (com o menu aberto) |
| `Tab` / `Enter` | Aceita a sugestão (com o menu aberto) |
| `←` `→` `↑` `↓` `Home` `End` `PgUp` `PgDn` | Move o cursor |
| `Ctrl+←/→`, `Alt+B`/`Alt+F` | Move por palavra |
| `Shift` + movimento | Seleciona |
| `Ctrl+A` | Seleciona tudo |
| `Backspace` / `Delete` (`Ctrl/Alt+` apaga a palavra) | Apaga |
| `Ctrl+W` / `Ctrl+U` / `Ctrl+K` | Apaga a palavra anterior / até o início da linha / até o fim da linha |
| `Ctrl+Z` / `Ctrl+Y` | Desfaz / refaz |
| `Ctrl+Q` | Cancela (o rascunho volta ao prompt) |
| `Esc` | Sai do editor (o rascunho volta ao prompt) |

### Por que "enviar" põe o texto no prompt em vez de mandar direto

O Claude Code não expande menções `@arquivo` num prompt enviado por um plugin; ele só faz isso com prompts que você mesmo envia. Para as referências `@` continuarem funcionando, o editor põe o texto no prompt nativo e você aperta Enter. Isso também te dá uma última olhada antes de mandar.

## Limitações conhecidas

- **É preciso clicar no editor antes de digitar.** O Claude Code só manda teclas para a área de edição de um plugin depois de um clique nela. Se o seu terminal não repassar eventos de mouse, o editor não recebe teclas.
- O **Tab** pode mover o foco entre os botões do painel antes de chegar ao editor. Se acontecer, aceite as sugestões com **Enter**.
- O **Ctrl+C** (copiar a seleção) pode ser capturado pelo próprio Claude Code. Colar pelo terminal funciona.
- **Sem anexar imagens.** Depois de mandar o texto para o prompt nativo, cole as imagens lá (`Ctrl+V` / `Alt+V`).
- Os textos da interface do editor (botões, dicas) estão em português.

## Como funciona

```
plugins/rich-input/
├── .claude-plugin/plugin.json   manifesto e opções (shortcutAction, showBand)
├── hooks/
│   ├── hooks.json               aponta o Claude Code para o register.tsx
│   ├── register.tsx             comando /rich, painel, botão do atalho, índice do @, devolução ao prompt
│   ├── editor.tsx               o editor (módulo de superfície Client: teclas, mouse, desenho)
│   ├── buffer.ts                modelo de texto: cursor, seleção, quebra de linha, detecção de @
│   └── complete.ts              autocomplete do @: navegação por pasta, busca aproximada
├── types/index.d.ts             tipos compartilhados e o contrato de estado do plugin
└── tests/rich-input.test.ts     testes (claude plugin test)
```

O `register.tsx` abre um painel com `$.ui.open` e desenha um `Client` que roda o `editor.tsx`. O editor manda cada edição, junto com a consulta `@` sob o cursor, para o `register.tsx`. O `register.tsx` responde com sugestões de um índice do projeto que ele guarda por 15 segundos. Ao enviar, o `register.tsx` fecha o painel e põe o texto no prompt com `$.prompt.fill`.

## Desenvolvimento

```bash
cd plugins/rich-input
claude plugin validate .   # confere o manifesto e o módulo de hooks
claude plugin test .       # roda tests/*.test.ts
```

Depois que o Claude Code carrega o plugin do disco, ele grava os tipos da API em `.claude-plugin/types/` (ignorado pelo git). A partir daí, `npx -p typescript tsc -p plugins/rich-input` faz a checagem de tipos.

Para editar ao vivo, rode `claude --plugin-dir plugins/rich-input`. O plugin recarrega sozinho quando você salva um arquivo.
