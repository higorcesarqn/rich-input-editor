# Rich Input Editor para Claude Code

[English](README.md) · **Português**

Um [Rich Input Editor no estilo do Warp](https://docs.warp.dev/agents/cli-agents/rich-input/) para o Claude Code, feito como plugin. Ele abre um editor multi-linha num painel dentro do terminal, com autocomplete de `@` para arquivos **e pastas**. Quando você termina, o texto volta para o prompt do Claude Code.

## Por quê

O Claude Code já tem o `Ctrl+G`, que abre o prompt no seu `$EDITOR`. Mas no editor externo você perde o autocomplete de `@` e precisa digitar os caminhos de cabeça. Este plugin mantém você dentro do Claude Code e completa as menções `@` enquanto você digita, pasta por pasta.

## Recursos

- **Editor multi-linha num painel.** Ele recebe o teclado assim que abre, sem precisar de mouse, então funciona em qualquer terminal. A linha em que você está é um campo de edição; as outras continuam desenhadas como texto, e ir até uma delas (setas, Tab ou clique) deixa você editá-la. O painel cresce junto com o texto.
- **Autocomplete de `@` para arquivos e pastas:**
  - `@` lista a raiz do projeto.
  - As sugestões aparecem como botões numerados embaixo da linha. **Tab** chega até elas, ou **Enter** aceita a primeira.
  - Ao aceitar uma pasta, o conteúdo dela aparece na hora (`@src/` → `@src/lib/` → arquivo).
  - Digitar só um nome (`@parse`) busca no projeto inteiro.
  - Usa `git ls-files`, então respeita o `.gitignore`. Fora de um repositório git, percorre as pastas (até 5.000 itens, sem `node_modules`, `dist` etc.).
  - Caminhos com espaço ficam entre aspas (`@"docs/minhas notas.md"`), como o prompt nativo faz.
- **Colar** um texto com várias linhas divide o texto em linhas.
- **Você nunca perde o rascunho:** o que estava no prompt vai para o editor quando ele abre. Fechar o editor (`Esc`, botão de fechar, Cancel) devolve o rascunho ao prompt.
- **Abre de três jeitos:** um atalho de teclado, o comando `/rich` ou o botão **✎ Rich input** acima do prompt.

## Requisitos

- Claude Code **2.1.289 ou mais novo**. O plugin usa a API de *function hooks* do Claude Code (módulos de hooks em TypeScript com painéis de UI). Essa API está em **acesso antecipado** e pode mudar entre versões.

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

## Atalhos de teclado

Plugins não podem registrar teclas próprias. Em vez disso, os botões do plugin escutam *ações* de keybinding do Claude Code, e você liga teclas a essas ações:

- o botão **✎ Rich input** (abre o editor) escuta `app:toggleReplTab`;
- o botão **Send to prompt** (manda o texto) escuta `app:toggleDiffPreSession`.

Para abrir o editor com **Alt+R** e enviar com **Ctrl+S**, coloque isto no `~/.claude/keybindings.json` (crie o arquivo se ele não existir):

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
    },
    {
      "context": "PaneField",
      "bindings": {
        "ctrl+s": "app:toggleDiffPreSession"
      }
    }
  ]
}
```

Se alguma dessas ações já tiver uso no seu ambiente, escolha outra ação sem uso e coloque-a na opção `shortcutAction` ou `sendAction` do plugin (`/plugin configure rich-input@rich-input-editor`, ou `/config`). O atalho de abrir só funciona enquanto a linha do botão acima do prompt estiver visível (opção `showBand`, ligada por padrão). Sem os atalhos, você ainda pode usar o `/rich` e chegar ao botão **Send to prompt** com **Tab**.

## Uso

1. Abra o editor: **Alt+R**, `/rich` ou o botão **✎ Rich input**. `/rich algum texto` abre o editor já com esse texto.
2. Escreva. **Enter** abre uma linha nova embaixo. Digite `@` para mencionar arquivos e pastas.
3. Aperte **Ctrl+S** (ou vá com Tab até **Send to prompt** e aperte Enter). O editor fecha e o texto vai para o prompt do Claude Code.
4. Aperte **Enter** para enviar.

### Teclas

| Tecla | Ação |
| --- | --- |
| `Enter` | Linha nova embaixo (com sugestões de `@` abertas: aceita a primeira) |
| `←` `→` `Backspace` `Delete` | Edita dentro da linha atual (corrige uma palavra sem redigitar a linha) |
| `↑` `↓` / `Tab` / `Shift+Tab` | Anda entre linhas, sugestões e botões (chegar numa linha abre ela para edição) |
| `1`–`9` | Aceita aquela sugestão (quando o foco está numa sugestão) |
| `Ctrl+S` | Manda o texto para o prompt (precisa do keybinding acima) |
| Botão **Delete line** | Apaga a linha atual |
| `Esc` | Sai do editor (o rascunho volta ao prompt) |

### Por que "enviar" põe o texto no prompt em vez de mandar direto

O Claude Code não expande menções `@arquivo` num prompt enviado por um plugin; ele só faz isso com prompts que você mesmo envia. Para as referências `@` continuarem funcionando, o editor põe o texto no prompt nativo e você aperta Enter. Isso também te dá uma última olhada antes de mandar.

## Limitações conhecidas

- **Enter sempre abre a linha nova *embaixo*.** O plugin não sabe onde está o cursor dentro da linha, então não consegue dividir uma linha em duas.
- **Para apagar uma linha, use o botão "Delete line".** Backspace numa linha vazia não apaga a linha.
- **As sugestões consideram que você digita no fim da linha.** Uma menção `@` no meio da linha é completada a partir do fim da linha.
- **Sem anexar imagens.** Depois de mandar o texto para o prompt nativo, cole as imagens lá (`Ctrl+V` / `Alt+V`).
- Os textos da interface do editor (botões, dicas) estão em inglês.
- O painel abre **acima** do prompt, ou **à direita** da conversa quando o Claude Code está no layout de tela cheia e o terminal tem **pelo menos 110 colunas**. Esse limite é do Claude Code e plugins não conseguem mudar; o `/rich` diz em qual caso você está (por exemplo `docking on the right needs 110 columns, this terminal has 98`). Dentro de um multiplexador de terminal (tmux, herdr…) o Claude Code abre no layout de tela normal, que nunca encaixa o painel: abra-o com `CLAUDE_CODE_NO_FLICKER=1` para ter o layout de tela cheia (no PowerShell, `$env:CLAUDE_CODE_NO_FLICKER=1; claude`, ou `setx CLAUDE_CODE_NO_FLICKER 1` para deixar fixo). Se depois disso uma barra lateral deixar menos de 110 colunas, esconda a barra ou diminua a fonte. O Claude Code não deixa plugins colocarem painel embaixo do prompt.

## Como funciona

```
plugins/rich-input/
├── .claude-plugin/plugin.json   manifesto e opções (shortcutAction, sendAction, showBand)
├── hooks/
│   ├── hooks.json               aponta o Claude Code para o register.tsx
│   ├── register.tsx             comando /rich, painel (a linha ativa como Input, as outras como linhas de texto), botões, índice do @, devolução ao prompt
│   └── complete.ts              autocomplete do @: navegação por pasta, busca aproximada, detecção de menção
├── types/index.d.ts             tipos compartilhados e o contrato de estado do plugin
└── tests/rich-input.test.ts     testes (claude plugin test)
```

O `register.tsx` abre um painel com `$.ui.open` e desenha a linha ativa como um `Input` e as outras como linhas que viram a ativa quando recebem o foco. Cada linha tem um id fixo, então o campo dela nunca passa para outra linha. As linhas ficam guardadas no estado do plugin. A cada mudança numa linha, ele verifica se ela termina numa menção `@`. Se terminar, desenha as sugestões como botões embaixo dessa linha, a partir de um índice do projeto que ele guarda por 15 segundos. Ao enviar, o `register.tsx` fecha o painel e põe o texto no prompt com `$.prompt.fill`.

## Desenvolvimento

```bash
cd plugins/rich-input
claude plugin validate .   # confere o manifesto e o módulo de hooks
claude plugin test .       # roda tests/*.test.ts
```

Depois que o Claude Code carrega o plugin do disco, ele grava os tipos da API em `.claude-plugin/types/` (ignorado pelo git). A partir daí, `npx -p typescript tsc -p plugins/rich-input` faz a checagem de tipos.

Para editar ao vivo, rode `claude --plugin-dir plugins/rich-input`. O plugin recarrega sozinho quando você salva um arquivo.

## Licença

[MIT](LICENSE) © Higor César
