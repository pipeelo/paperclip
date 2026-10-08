# Trava de tools no Paperclip

## Regra

Só quem está em `liberados` (`config.json`, hoje só o André) muda tool, função ou
environment da Pipeelo por um agente do Paperclip. Pedido de qualquer outra pessoa
(Lucas e todo membro sem dono) vira demanda atribuída ao André.

"Mudar tool" = `POST`, `PUT`, `PATCH` ou `DELETE` num host `*.pipeelo.com` nestas rotas:

- `/v1/custom-command` (script da tool)
- `/v1/tool` (tool LIBRARY)
- `/v1/function-calling` (função)
- `/v1/environment`
- `/api/admin/library-tools` (admin)

`/v1/tool-execute` e leitura (`GET`) continuam livres.

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

1. `hook.cjs`: hook `PreToolUse` do Claude Code no `Bash`. Barra `curl`, `python`,
   script da skill (`update-tool-script.js`) e qualquer comando que mexa em `NODE_OPTIONS`.
   Também lê o script `.js/.py/.sh/.ts` que o comando roda.
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

1. `node core/trava-tools/gerar-dockerfile.mjs [imagem]` gera `core/trava-tools/Dockerfile`
   com o patch do `parar-tudo` e a trava.
2. Cole o Dockerfile no serviço `pipeelo/paperclip` do Easypanel (fonte Dockerfile) e implante.
3. Teste: `node --test core/trava-tools/trava.test.cjs`.
