# Paperclip da Pipeelo

Este repositório é o fork da Pipeelo do [paperclipai/paperclip](https://github.com/paperclipai/paperclip).
O Easypanel monta a imagem do serviço `pipeelo/paperclip` a partir do ramo `main` daqui.

## Ramos

| ramo | o que é |
|---|---|
| `main` | Versão oficial que roda na produção + as mudanças da Pipeelo. O Easypanel monta deste ramo. |
| `master` | Cópia do original. Não recebe commit nosso. |
| `atualiza/<versão>` | Ramo de trabalho para trazer uma versão nova do original. |

Remotes do clone local: `origin` = este fork, `upstream` = paperclipai/paperclip.

## Mudanças da Pipeelo

Cada mudança nossa é um commit com prefixo `feat(pipeelo)` ou `fix(pipeelo)`.
Para listar: `git log --oneline --grep="(pipeelo)" main`.

| mudança | onde |
|---|---|
| Botão Parar pausa a tarefa e as filhas | `server/src/routes/agents.ts` (`pipeelo_parar_tudo`) |
| Trava de tools: só quem está na lista muda tool, função ou environment da Pipeelo | `docker/pipeelo/claude-code/` + `Dockerfile` |
| Claude Code, Codex e OpenCode com versão fixa | `Dockerfile` |
| Quadro busca 20 tarefas por coluna e mais 20 quando a pessoa rola; total real no topo; coluna vazia aberta (só Cancelada recolhe) | `ui/src/components/KanbanBoard.tsx`, `IssuesList.tsx`, `pages/Issues.tsx` |
| Total de tarefas por status: `GET /companies/:companyId/issues/status-counts` | `server/src/routes/issues.ts`, `issueService.countByStatus` |

## Testes

O PC local não aguenta o `pnpm install`. Rode os testes na imagem, no servidor:

- Tela: `docker run --rm -e NODE_ENV=test --entrypoint sh -w /app/ui <imagem> -c 'npx vitest run <arquivos>'`
- Servidor (banco embutido, não roda como root): `docker run --rm -u node -e HOME=/tmp -e NODE_ENV=test --entrypoint sh -w /app/server <imagem> -c 'npx vitest run <arquivos>'`

## Como trazer uma versão nova do original

1. Veja as versões novas:
   `git fetch upstream --tags && git tag -l 'v*' --sort=-creatordate | grep -v -e beta -e canary | head`
2. Crie o ramo de trabalho a partir do `main`:
   `git switch -c atualiza/<versão> main`
3. Junte a versão nova:
   `git merge <versão>`
4. Resolva os conflitos. A regra: fica o código novo do original, e a mudança da Pipeelo é refeita em cima dele.
5. Leia o `releases/` e o changelog da versão. Procure migração de banco e mudança no SDK de plugin.
6. Envie o ramo (`git push -u origin atualiza/<versão>`).
7. Monte a imagem de teste no servidor, sem tocar no serviço:
   `docker build -t pipeelo-paperclip:teste https://github.com/pipeelo/paperclip.git#atualiza/<versão>`
8. Antes de liberar, faça backup do banco `pipeelo_paperclip-db` e do volume `/paperclip`.
9. Junte no `main` e faça o deploy pelo Easypanel.
10. Confira os plugins da Pipeelo (`GET /api/plugins`, todos `ready`) e o botão Parar.

Pule versão grande de uma vez só com backup e com tempo para voltar.
Para voltar: no Easypanel, aponte o serviço para o commit anterior do `main` e faça o deploy.
