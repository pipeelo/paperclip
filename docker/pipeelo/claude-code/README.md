# Trava de tools no Paperclip

## Regra

Toda escrita de tool, função ou environment da Pipeelo por um agente do Paperclip passa
pelo lint (ver "Lint"), para qualquer pessoa.

Rota de um tenant só (`/v1/custom-command`, `/v1/function-calling`, `/v1/environment`
e `/v1/tool` com `type` diferente de `LIBRARY` no corpo): qualquer pessoa grava, se o
lint não barra.

Rota global (`/v1/tool` LIBRARY ou sem `type` no corpo, `/api/admin/library-tools`): só
quem está em `liberados` (`config.json`, hoje só o André) grava. Pedido de outra pessoa
vira demanda atribuída ao André.

"Mudar tool" = `POST`, `PUT`, `PATCH` ou `DELETE` num host `*.pipeelo.com` nestas rotas:

- `/v1/custom-command` (script da tool)
- `/v1/tool` (tool LIBRARY)
- `/v1/function-calling` (função)
- `/v1/environment`
- `/api/admin/library-tools` (admin)

`/v1/tool-execute` e leitura (`GET`) continuam livres.

## Lint

O `fetch.cjs` lê o corpo da escrita e roda as regras abaixo. Regra que barra devolve o erro
`PIPEELO_TRAVA_LINT` com a regra, o trecho achado e como corrigir. Aviso sai no stderr com o
prefixo `PIPEELO_LINT_AVISO`.

| regra | o que pega | efeito |
|---|---|---|
| 1 | o script lê KB (`/knowledge-base`) | barra |
| 2 | um campo do schema com `enum` que mistura leitura (consultar, listar...) e escrita (agendar, criar...) | barra |
| 3 | função de leitura (`consultar_`, `buscar_`, `verificar_`, `listar_`) devolve `agenda`, `tecnico`, `fila`, `departamento`, `slug` e afins | barra |
| 4 | lista literal com 5+ nomes em maiúsculas no script | avisa |
| 5 | nome da função sem verbo de leitura ou de escrita | avisa |

Exceção: item em `excecoesLint` do `config.json` (`funcao`, `regra`, `motivo`). Só o André edita.

## Quem pediu

O run fica restrito quando aparece uma pessoa fora de `liberados` em um destes lugares:

1. Chat: a 1ª linha do pedido (`[chat] pessoa: <nome> (id <userId>)`).
2. Task do run, ou mãe/avó dela: `createdByUserId`.
3. Task do run, ou mãe/avó dela: linha `Pedido por: <nome> (<userId>)` na descrição.
4. Comentário de pessoa que acordou o run.

Task com a marca `[trava-tools]` (demanda aberta pela trava) também fica restrita.
Um comentário de um liberado com `#libera-tools` na task do run libera aquele run.
Se a API não responde, o run fica restrito.

## Camadas

1. `hook.cjs`: hook `PreToolUse` do Claude Code no `Bash`. Barra sempre `curl`, `python`
   e script `.py/.sh` que gravam nessas rotas: a escrita vai pela skill com node, para passar
   pelo lint. Barra, em run restrito, comando que mexa em `NODE_OPTIONS`.
2. `fetch.cjs`: carregado por `NODE_OPTIONS=--require` em todo `node` do agente. Barra a
   chamada em `fetch`, `http.request` e `https.request`, mesmo com URL montada.

Quando barra, o agente recebe o passo a passo: abrir a demanda com `demanda.cjs`,
responder a quem pediu com o link e fechar a task de origem.

`demanda.cjs` cria a task atribuída ao André, no mesmo projeto da task de origem,
com a marca `[trava-tools]`. Título igual a uma demanda aberta do André devolve a existente.

Os arquivos ficam em `/etc/claude-code` (root, só leitura para o agente). O
`managed-settings.json` é a config gerenciada do Claude Code: o agente não sobrescreve.

## Limite conhecido

A camada de texto não pega URL montada em `curl` ou `python` por variável. A camada do
`fetch` pega tudo que sai por Node. Script novo que chama `curl` por `child_process`
passa pela camada de texto do comando que o roda, não pela do `curl` em si.

## Como gerar e implantar

1. Teste: `node --test docker/pipeelo/claude-code/pipeelo-trava/`.
2. O `Dockerfile` da raiz copia a trava para `/etc/claude-code`. O Easypanel monta do `main`
   (ver `PIPEELO.md`).
