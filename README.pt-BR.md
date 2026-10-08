# Rich Input Editor para Claude Code

[English](README.md) · **Português**

Um [Rich Input Editor no estilo do Warp](https://docs.warp.dev/agents/cli-agents/rich-input/) para o Claude Code, feito como plugin. Ele transforma o próprio prompt do Claude Code num editor multi-linha que você liga e desliga: ligado, o **Enter** abre uma linha nova onde o cursor está e o **Ctrl+Enter** envia. O `@` completa arquivos **e pastas**, uma pasta de cada vez.

## Por quê

O Claude Code já tem o `Ctrl+G`, que abre o prompt no seu `$EDITOR`. Mas no editor externo você perde o autocomplete de `@` e precisa digitar os caminhos de cabeça. E no prompt comum o Enter envia, então escrever várias linhas exige `Shift+Enter` ou `\` no fim de cada linha. Com este plugin, o próprio prompt funciona como um editor quando você quiser.

## Recursos

- **O prompt é o editor.** O cursor anda livre: setas, Home/End, Enter no meio de uma linha divide a linha, Backspace no começo de uma linha junta com a de cima. Colar, imagens e o histórico de prompts funcionam como sempre, porque é o prompt do próprio Claude Code.
- **Liga e desliga com uma tecla:** `Alt+R` ou `/rich`. Desligado, o Enter envia como sempre.
- **Dá para ver quando está ligado:** o texto que você digita fica azul, `rich input` aparece no rodapé abaixo do prompt e a linha acima do prompt diz `✎ Rich input: on`.
- **Um editor em painel (`Alt+E` ou `/rich pane`)** para terminais que repassam o clique do mouse ao Claude Code: um editor com cursor livre ao lado da conversa, com menu de `@` próprio, clique direito para colar e `Ctrl+S` para pôr o texto no prompt. Veja [Editor em painel](#editor-em-painel).
- **Autocomplete de `@` que navega pelas pastas:**
  - `@` lista a raiz do projeto.
  - As sugestões do plugin aparecem embaixo das sugestões do próprio prompt. Ao escolher uma pasta (`@src/`), a menção continua aberta e o conteúdo da pasta aparece, então você vai de `@src/` → `@src/lib/` → arquivo.
  - Digitar só um nome (`@parse`) busca no projeto inteiro.
  - Usa `git ls-files`, então respeita o `.gitignore`. Fora de um repositório git, percorre as pastas (até 5.000 itens, sem `node_modules`, `dist` etc.).
  - Caminhos com espaço ficam entre aspas (`@"docs/minhas notas.md"`), como o prompt nativo faz.

## Requisitos

- Claude Code **2.1.292 ou mais novo**. O plugin usa a API de *function hooks* do Claude Code (módulos de hooks em TypeScript). Essa API está em **acesso antecipado** e pode mudar entre versões.

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

## Ligar e desligar

Rode `/rich`, ou aperte `Alt+R`, para alternar. Plugins não conseguem mudar o que o Enter faz no prompt, mas os atalhos do Claude Code conseguem, então alternar edita o bloco `Chat` do `~/.claude/keybindings.json`:

- **Ligar** acrescenta `"enter": "chat:newline"` e `"ctrl+enter": "chat:submit"`.
- **Desligar** remove essas duas entradas, e só enquanto elas continuam iguais. O resto do arquivo fica como está.

O Claude Code aplica a mudança na hora, e ela vale para todas as sessões, porque o arquivo é um só. Se o arquivo não for um JSON que o plugin consiga editar, ele não mexe e o `/rich` avisa.

Alguns terminais mandam o Ctrl+Enter como um Enter comum. Nesses, acrescente você mesmo outra tecla de envio no bloco `Chat`, por exemplo `"ctrl+s": "chat:submit"`; desligar não mexe nela.

### Os atalhos Alt+R e Alt+E

Plugins não conseguem registrar teclas próprias. Os botões acima do prompt escutam ações de atalho, e você liga teclas a essas ações: o `✎ Rich input` escuta `app:toggleReplTab`, o `▤ Editor` escuta `app:toggleDiffPreSession`. Adicione isto ao `~/.claude/keybindings.json` (crie o arquivo se ele não existir):

```json
{
  "$schema": "https://www.schemastore.org/claude-code-keybindings.json",
  "$docs": "https://code.claude.com/docs/en/keybindings",
  "bindings": [
    {
      "context": "Global",
      "bindings": {
        "alt+r": "app:toggleReplTab",
        "alt+e": "app:toggleDiffPreSession"
      }
    }
  ]
}
```

Se alguma dessas ações já estiver em uso no seu setup, escolha outra ação sem uso e configure na opção `toggleAction` ou `paneAction` do plugin (`/plugin configure rich-input@rich-input-editor`, ou `/config`). Os atalhos só funcionam enquanto a linha acima do prompt estiver visível (`showBand`, ligada por padrão).

Vindo da 0.4: mantenha o `alt+r` e remova o `ctrl+s` → `app:toggleDiffPreSession` do contexto `PaneField`, senão ele aperta o `▤ Editor`.

## Editor em painel

`Alt+E` (ou `/rich pane`) abre um editor ao lado da conversa, levando para ele o que estiver no prompt. Ele precisa de um terminal que repasse o clique do mouse ao Claude Code: o painel só recebe o teclado depois de um clique, e nenhum plugin consegue pular isso. Até lá, a primeira linha dele diz `▶ Click here to start typing`.

- Digite em qualquer lugar: setas, Home/End, um clique no texto leva o cursor até ali, Enter divide a linha, Backspace no começo de uma linha junta com a de cima, Delete junta com a de baixo.
- `@` abre um menu de arquivos e pastas embaixo da linha; as setas escolhem, Enter ou Tab aceitam, e uma pasta lista o conteúdo em seguida.
- **Clique direito cola** a área de transferência. O Ctrl+V não chega ao painel, então o plugin lê a área de transferência por conta própria (`powershell Get-Clipboard` no Windows, `pbpaste`, `wl-paste` ou `xclip` nos outros).
- **Ctrl+S** fecha o painel e põe o texto no prompt; aperte Enter lá para enviar, assim as referências `@` são resolvidas.
- `Esc` devolve o teclado ao Claude Code sem fechar o painel; um clique volta para ele. `Alt+E` de novo (ou o fechar do painel) fecha e devolve o rascunho ao prompt.
- Ele fica à direita com o layout de tela cheia do Claude Code e pelo menos 110 colunas; fora disso, abre acima do prompt.

## Teclas

| Tecla | Ação |
| --- | --- |
| `Alt+R` / `/rich` | Liga ou desliga o Rich Input |
| `Alt+E` / `/rich pane` | Abre ou fecha o editor em painel |
| `Enter` | Ligado: linha nova onde o cursor está (com sugestões do `@` abertas: escolhe a destacada). Desligado: envia |
| `Ctrl+Enter` | Ligado: envia |
| `←` `→` `↑` `↓` `Home` `End` | Movem o cursor |
| `Backspace` no começo de uma linha | Junta com a linha de cima |
| `@` | Completa arquivos e pastas; escolher uma pasta lista o conteúdo dela |

## Como funciona

```
plugins/rich-input/
├── .claude-plugin/plugin.json   manifesto e opções (toggleAction, paneAction, showBand)
├── hooks/
│   ├── hooks.json               aponta o Claude Code para o register.tsx
│   ├── register.tsx             /rich, a linha acima do prompt, o rótulo no rodapé, o rascunho azul, as sugestões do @, o editor em painel
│   ├── editor.tsx               o editor em painel: desenha o texto e o cursor, recebe teclas e cliques
│   ├── editor-core.ts           as edições, os movimentos do cursor, o menu do @ e a rolagem do editor em painel
│   ├── bindings.ts              liga e desliga os atalhos do bloco Chat no keybindings.json
│   └── complete.ts              autocomplete do @: navegação por pasta, busca aproximada, linhas do typeahead
├── types/index.d.ts             tipos compartilhados e o contrato de estado do plugin
└── tests/rich-input.test.tsx    testes (claude plugin test)
```

O `register.tsx` lê o `keybindings.json` quando a sessão começa e guarda no estado do plugin se o Rich Input está ligado. O `/rich` e o botão reescrevem o arquivo por meio do `bindings.ts`. Enquanto está ligado, um hook `prompt.edit` pinta o rascunho e a lista de modos do rodapé ganha `rich input`. Um hook `prompt.autocomplete` acrescenta as sugestões do `@` a partir de um índice do projeto guardado por 15 segundos; a linha de uma pasta deixa o cursor dentro da menção, então o Claude Code pergunta de novo e o conteúdo da pasta aparece.

O editor em painel é um módulo de superfície `Client` (`editor.tsx`) que recebe teclas e cliques depois do primeiro clique. Ele manda ao `register.tsx` o rascunho, a busca de `@` que precisa e os pedidos de colar e enviar, e o `register.tsx` responde pelas props do painel: sugestões do mesmo índice, o texto da área de transferência e, ao enviar, o prompt.

## Desenvolvimento

```bash
cd plugins/rich-input
claude plugin validate .   # confere o manifesto e o módulo de hooks
claude plugin test .       # roda tests/*.test.tsx
```

Depois que o Claude Code carrega o plugin do disco, ele grava os tipos da API em `.claude-plugin/types/` (ignorado pelo git). A partir daí, `npx -p typescript tsc -p plugins/rich-input` faz a checagem de tipos.

Para editar ao vivo, rode `claude --plugin-dir plugins/rich-input`. O plugin recarrega sozinho quando você salva um arquivo.

## Licença

[MIT](LICENSE) © Higor César
