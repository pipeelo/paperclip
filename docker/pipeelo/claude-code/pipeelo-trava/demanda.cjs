"use strict";

const fs = require("node:fs");
const { lerConfig, criarApi, quemPediu, MARCA_DEMANDA, LIBERA } = require("./trava.cjs");

const ABERTAS = ["backlog", "todo", "in_progress", "in_review", "blocked"];

function argumentos(argv) {
  const r = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--titulo") r.titulo = argv[++i];
    else if (argv[i] === "--descricao") r.descricao = argv[++i];
    else if (argv[i] === "--arquivo") r.descricao = fs.readFileSync(argv[++i], "utf8");
  }
  return r;
}

async function abrirDemanda({ titulo, descricao }, { env = process.env, fetchFn = globalThis.fetch, config = lerConfig() } = {}) {
  if (!titulo || !String(titulo).trim()) throw new Error("falta --titulo");
  if (!descricao || !String(descricao).trim()) throw new Error("falta --descricao");
  const pedir = criarApi({ url: env.PAPERCLIP_API_URL, chave: env.PAPERCLIP_API_KEY, fetchFn });
  const run = await pedir(`/heartbeat-runs/${encodeURIComponent(env.PAPERCLIP_RUN_ID)}`);
  const companyId = run.companyId;
  const ctx = run.contextSnapshot || {};
  const issueId = ctx.issueId || ctx.taskId || env.PAPERCLIP_TASK_ID || null;
  const origem = issueId ? await pedir(`/issues/${encodeURIComponent(issueId)}`) : null;
  const quem = await quemPediu({ env, fetchFn, config });
  const nomes = [...new Set(quem.pessoas.map((p) => p.nome).filter(Boolean))];
  const responsavel = config.responsavel;
  const tituloLimpo = String(titulo).trim();

  const abertas = await pedir(`/companies/${companyId}/issues?status=${ABERTAS.join(",")}&limit=200`);
  const igual = (Array.isArray(abertas) ? abertas : []).find(
    (t) => t.assigneeUserId === responsavel.id && String(t.title || "").trim().toLowerCase() === tituloLimpo.toLowerCase(),
  );
  const painel = String(config.painelUrl).replace(/\/+$/, "");
  if (igual) return { identifier: igual.identifier, url: `${painel}/${config.prefixo}/issues/${igual.identifier}`, jaExistia: true };

  const corpo = [
    String(descricao).trim(),
    "",
    "---",
    `${MARCA_DEMANDA} Mudança de tool barrada pela trava. Só ${responsavel.nome} decide e aplica.`,
    `Pedido por: ${nomes.length ? nomes.join(", ") : "não identificado"}.`,
    origem ? `Task de origem: ${origem.identifier}.` : "Origem: chat do Paperclip.",
    `Para o Jarvis aplicar: comente \`${LIBERA}\` nesta task e atribua ao Jarvis.`,
  ].join("\n");
  const body = { title: tituloLimpo, description: corpo, status: "todo", assigneeUserId: responsavel.id };
  if (origem?.projectId) body.projectId = origem.projectId;
  const t = await pedir(`/companies/${companyId}/issues`, { method: "POST", body: JSON.stringify(body) });
  return { identifier: t.identifier, url: `${painel}/${config.prefixo}/issues/${t.identifier}`, jaExistia: false };
}

module.exports = { abrirDemanda, argumentos };

if (require.main === module) {
  abrirDemanda(argumentos(process.argv.slice(2)))
    .then((r) => {
      process.stdout.write(`${r.jaExistia ? "Já existia" : "Demanda aberta"}: ${r.identifier} ${r.url}\n`);
    })
    .catch((e) => {
      process.stderr.write(`Falhou ao abrir a demanda: ${e.message}\n`);
      process.exit(1);
    });
}
