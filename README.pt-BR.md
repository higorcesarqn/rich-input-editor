# Rich Input Editor para Claude Code

[English](README.md) · **Português**

Um [Rich Input Editor no estilo do Warp](https://docs.warp.dev/agents/cli-agents/rich-input/) para o Claude Code, feito como plugin. Ele transforma o próprio prompt do Claude Code num editor multi-linha: **Enter** abre uma linha nova onde o cursor está, **Ctrl+Enter** envia, e o `@` completa arquivos **e pastas**, uma pasta de cada vez.

## Por quê

O Claude Code já tem o `Ctrl+G`, que abre o prompt no seu `$EDITOR`. Mas no editor externo você perde o autocomplete de `@` e precisa digitar os caminhos de cabeça. E no prompt comum o Enter envia, então escrever várias linhas exige `Shift+Enter` ou `\` no fim de cada linha. Com este plugin, o próprio prompt funciona como um editor.

## Recursos

- **O prompt é o editor.** O cursor anda livre: setas, Home/End, Enter no meio de uma linha divide a linha, Backspace no começo de uma linha junta com a de cima. Colar, imagens e o histórico de prompts funcionam como sempre, porque é o prompt do próprio Claude Code.
- **Autocomplete de `@` que navega pelas pastas:**
  - `@` lista a raiz do projeto.
  - As sugestões do plugin aparecem embaixo das sugestões do próprio prompt. Ao escolher uma pasta (`@src/`), a menção continua aberta e o conteúdo da pasta aparece, então você vai de `@src/` → `@src/lib/` → arquivo.
  - Digitar só um nome (`@parse`) busca no projeto inteiro.
  - Usa `git ls-files`, então respeita o `.gitignore`. Fora de um repositório git, percorre as pastas (até 5.000 itens, sem `node_modules`, `dist` etc.).
  - Caminhos com espaço ficam entre aspas (`@"docs/minhas notas.md"`), como o prompt nativo faz.
- **Uma dica acima do prompt** lembra as teclas (`showHint`, ligada por padrão).
- **`/rich`** explica como funciona.

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

## Configuração do teclado (obrigatória)

Plugins não conseguem mudar o que o Enter faz no prompt, mas os atalhos do Claude Code conseguem. Adicione isto ao `~/.claude/keybindings.json` (crie o arquivo se ele não existir):

```json
{
  "$schema": "https://www.schemastore.org/claude-code-keybindings.json",
  "$docs": "https://code.claude.com/docs/en/keybindings",
  "bindings": [
    {
      "context": "Chat",
      "bindings": {
        "enter": "chat:newline",
        "ctrl+enter": "chat:submit",
        "ctrl+s": "chat:submit"
      }
    }
  ]
}
```

- **Enter** insere uma linha nova. Com as sugestões do `@` abertas, o Enter continua escolhendo a sugestão destacada.
- **Ctrl+Enter** envia. Alguns terminais mandam o Ctrl+Enter como um Enter comum; neles, use **Ctrl+S**.

Isso muda o Enter em todas as sessões do Claude Code. Para voltar ao normal, remova o bloco `Chat`.

Vindo da 0.4: o painel do editor não existe mais, então os atalhos `app:toggleReplTab` e `app:toggleDiffPreSession` que ele usava podem ser removidos.

## Teclas

| Tecla | Ação |
| --- | --- |
| `Enter` | Linha nova onde o cursor está (com sugestões do `@` abertas: escolhe a destacada) |
| `Ctrl+Enter` / `Ctrl+S` | Envia o prompt |
| `←` `→` `↑` `↓` `Home` `End` | Movem o cursor |
| `Backspace` no começo de uma linha | Junta com a linha de cima |
| `@` | Completa arquivos e pastas; escolher uma pasta lista o conteúdo dela |

## Como funciona

```
plugins/rich-input/
├── .claude-plugin/plugin.json   manifesto e a opção showHint
├── hooks/
│   ├── hooks.json               aponta o Claude Code para o register.tsx
│   ├── register.tsx             /rich, a dica acima do prompt, as sugestões do @, o índice do projeto
│   └── complete.ts              autocomplete do @: navegação por pasta, busca aproximada, linhas do typeahead
├── types/index.d.ts             tipos compartilhados
└── tests/rich-input.test.ts     testes (claude plugin test)
```

O `register.tsx` usa o hook `prompt.autocomplete` para as palavras que começam com `@`. Ele acrescenta linhas ao typeahead do prompt a partir de um índice do projeto que guarda por 15 segundos. A linha de uma pasta escreve `@pasta/` e deixa o cursor dentro da menção, então o Claude Code pergunta de novo e o conteúdo da pasta aparece. A edição multi-linha em si é o prompt do Claude Code com os atalhos acima.

As versões anteriores (até a 0.4) desenhavam um editor próprio num painel. Lá o painel só oferece campos de uma linha, então não dava para ter cursor livre nem juntar linhas com Backspace; o prompt tem tudo isso.

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
