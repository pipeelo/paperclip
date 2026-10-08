"use strict";

const fs = require("node:fs");
const path = require("node:path");

const PASTA = __dirname;
const MARCA_DEMANDA = "[trava-tools]";
const LIBERA = "#libera-tools";
const METODOS_QUE_MUDAM = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const HOST_PIPEELO = /(^|\.)pipeelo\.com$/i;
const ROTA_DE_TOOL = /^\/(v1\/(custom-commands?|tools?|function-callings?|environments?)(\/|$)|api\/admin\/library-tools(\/|$))/i;
const ALVO_NO_TEXTO = /(\/v1\/(custom-commands?|tools?|function-callings?|environments?)\b(?!-)|\/api\/admin\/library-tools\b|update-tool-script)/i;
const SO_PAPERCLIP = /(PAPERCLIP_API_URL|easypanel\.host)/;
const HOST_NO_TEXTO = /pipeelo\.com/i;
const MUDANCA_NO_TEXTO = /(-X\s*['"]?(PUT|POST|PATCH|DELETE)\b|--request[\s=]+['"]?(PUT|POST|PATCH|DELETE)\b|method['"]?\s*[:=]\s*['"](PUT|POST|PATCH|DELETE)['"]|\.(put|post|patch|delete)\s*\(|\s(-d|--data[\w-]*|--json|-F|--form)[\s=]|update-tool-script)/i;
const MEXE_NA_TRAVA = /(NODE_OPTIONS|--require\b|\s-r\s+\S+\.c?js)/;
const ARQUIVO_NO_COMANDO = /(?:^|[\s'"=])((?:~|\.{1,2}|\/)?[\w@.\/~+-]*\.(?:m?js|cjs|ts|py|sh))(?=$|[\s'";|&)])/g;

function lerConfig() {
  return JSON.parse(fs.readFileSync(path.join(PASTA, "config.json"), "utf8"));
}

function mudaTool(metodo, url) {
  if (!METODOS_QUE_MUDAM.has(String(metodo || "GET").toUpperCase())) return false;
  let u;
  try {
    u = new URL(String(url));
  } catch {
    return false;
  }
  return HOST_PIPEELO.test(u.hostname) && ROTA_DE_TOOL.test(u.pathname);
}

function textoMudaTool(texto) {
  if (SO_PAPERCLIP.test(texto) && !HOST_NO_TEXTO.test(texto)) return false;
  return ALVO_NO_TEXTO.test(texto) && MUDANCA_NO_TEXTO.test(texto);
}

function arquivosDoComando(comando, cwd, home) {
  const achados = new Set();
  for (const m of String(comando).matchAll(ARQUIVO_NO_COMANDO)) {
    let p = m[1];
    if (p.startsWith("~")) p = path.join(home || "", p.slice(1));
    achados.add(path.resolve(cwd || process.cwd(), p));
  }
  return [...achados];
}

function comandoSuspeito(comando, { cwd, home, ler = (p) => fs.readFileSync(p, "utf8") } = {}) {
  const texto = String(comando || "");
  if (MEXE_NA_TRAVA.test(texto)) return "o comando mexe na trava de tools";
  if (textoMudaTool(texto)) return "o comando altera tool, função ou environment";
  for (const arquivo of arquivosDoComando(texto, cwd, home)) {
    let conteudo;
    try {
      if (fs.statSync(arquivo).size > 1024 * 1024) continue;
      conteudo = ler(arquivo);
    } catch {
      continue;
    }
    if (textoMudaTool(conteudo)) return `o script ${arquivo} altera tool, função ou environment`;
  }
  return null;
}

function idsDoTexto(texto) {
  const ids = [];
  for (const m of String(texto || "").matchAll(/Pedido por: ([^\n()]*)\(([A-Za-z0-9_-]{8,})\)/g)) ids.push({ id: m[2], nome: m[1].trim() });
  return ids;
}

function pessoaDoChat(textoDoPedido) {
  const primeira = String(textoDoPedido || "").split("\n")[0];
  const m = primeira.match(/^\[chat\] pessoa: (.*) \(id ([A-Za-z0-9_-]+)\)\s*$/);
  return m ? { id: m[2], nome: m[1].trim() } : null;
}

function criarApi({ url, chave, fetchFn }) {
  const base = String(url || "").replace(/\/+$/, "");
  return async function pedir(rota, opcoes = {}) {
    const res = await fetchFn(`${base}/api${rota}`, {
      ...opcoes,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${chave}`, ...(opcoes.headers || {}) },
    });
    const texto = await res.text();
    if (!res.ok) throw new Error(`${rota} respondeu ${res.status}: ${texto.slice(0, 200)}`);
    return texto ? JSON.parse(texto) : null;
  };
}

function autorDoComentario(c) {
  return c.authorUserId || (c.authorType === "user" ? c.author?.id || c.userId : null) || null;
}

async function quemPediu({ env = process.env, fetchFn = globalThis.fetch, lerArquivo = (p) => fs.readFileSync(p, "utf8"), config = lerConfig() } = {}) {
  const runId = env.PAPERCLIP_RUN_ID;
  if (!runId) return { restrito: false, pessoas: [], motivo: "fora de um run do Paperclip" };
  const liberados = new Set(config.liberados.map((p) => p.id));
  try {
    const pedir = criarApi({ url: env.PAPERCLIP_API_URL, chave: env.PAPERCLIP_API_KEY, fetchFn });
    const run = await pedir(`/heartbeat-runs/${encodeURIComponent(runId)}`);
    const ctx = run.contextSnapshot || {};
    const pessoas = [];
    let precisaLiberar = false;

    const taskKey = String(ctx.taskKey || "");
    if (taskKey.startsWith(config.prefixoChat)) {
      const pessoa = pessoaDoChat(lerArquivo(path.join(config.pastaChat, `${taskKey}.md`)));
      if (!pessoa) throw new Error("não achei a pessoa do chat");
      pessoas.push(pessoa);
    }

    const issueId = ctx.issueId || ctx.taskId || env.PAPERCLIP_TASK_ID || null;
    let comentarios = [];
    if (issueId) {
      let atual = issueId;
      for (let i = 0; atual && i < 10; i++) {
        const issue = await pedir(`/issues/${encodeURIComponent(atual)}`);
        if (issue.createdByUserId) pessoas.push({ id: issue.createdByUserId, nome: "" });
        pessoas.push(...idsDoTexto(issue.description));
        if (String(issue.description || "").includes(MARCA_DEMANDA)) precisaLiberar = true;
        atual = issue.parentId || null;
      }
      const lista = await pedir(`/issues/${encodeURIComponent(issueId)}/comments`);
      comentarios = Array.isArray(lista) ? lista : lista?.comments || [];
      const idDoComentario = ctx.wakeCommentId || ctx.commentId || env.PAPERCLIP_WAKE_COMMENT_ID;
      const quemComentou = idDoComentario ? comentarios.find((c) => c.id === idDoComentario) : null;
      if (quemComentou && autorDoComentario(quemComentou)) pessoas.push({ id: autorDoComentario(quemComentou), nome: "" });
    }

    const liberou = comentarios.some((c) => liberados.has(autorDoComentario(c)) && String(c.body || "").toLowerCase().includes(LIBERA));
    const barrados = pessoas.filter((p) => !liberados.has(p.id));
    if (liberou) return { restrito: false, pessoas, motivo: `um liberado comentou ${LIBERA}` };
    if (barrados.length) return { restrito: true, pessoas: barrados, motivo: "pedido de pessoa sem permissão para mudar tool" };
    if (precisaLiberar) return { restrito: true, pessoas, motivo: `demanda da trava sem o comentário ${LIBERA} de um liberado` };
    return { restrito: false, pessoas, motivo: "nenhuma pessoa sem permissão no pedido" };
  } catch (e) {
    return { restrito: true, pessoas: [], motivo: `não confirmei quem pediu (${e.message})` };
  }
}

function avisoDeBloqueio(quem, oQue, config = lerConfig()) {
  const nomes = quem.pessoas.map((p) => p.nome || p.id).filter(Boolean);
  const responsavel = config.responsavel.nome;
  return [
    `BLOQUEADO pela trava de tools: ${oQue}.`,
    `Motivo: ${quem.motivo}${nomes.length ? ` (${[...new Set(nomes)].join(", ")})` : ""}.`,
    `Só ${responsavel} muda tool, função ou environment da Pipeelo. Não tente outro caminho (curl, python, script novo, painel).`,
    "Faça assim:",
    `1. Escreva com a ferramenta Write um arquivo .md com o pedido, a causa achada, a mudança proposta e a tool com a versão.`,
    `2. Abra a demanda para ${responsavel}: node ${path.join(PASTA, "demanda.cjs")} --titulo "<tenant>: <o que mudar>" --arquivo <caminho do .md>`,
    "3. Responda a quem pediu com o link da demanda, em 1 linha.",
    "4. Se este run é de uma task, comente o link nela e marque a task como done.",
  ].join("\n");
}

module.exports = {
  MARCA_DEMANDA,
  LIBERA,
  lerConfig,
  mudaTool,
  textoMudaTool,
  comandoSuspeito,
  pessoaDoChat,
  idsDoTexto,
  quemPediu,
  avisoDeBloqueio,
  criarApi,
};

if (require.main === module && process.argv[2] === "--quem") {
  quemPediu().then((q) => process.stdout.write(JSON.stringify(q)));
}
